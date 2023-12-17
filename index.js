const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");

debugEnabled = true
const STATUS_FIELD = "Status"

// Toolkit docs: https://github.com/actions/toolkit
async function execQuery(token, title, query) {
  if (debugEnabled) {
    showQuery(title, query);
  }
  const result = await graphql(
    query,
    {
      headers: {
        authorization: `token ` + token,
      },
    }
  );
  showDebug(result);
  return result;
}

async function processWithInputs(inputs) {
  showLog("Starting")
  debugEnabled = inputs.debug == 'true'
  showDebug(inputs);
  // Get Projects From Repo
  let project = await getRepositoryProjects(inputs.token, inputs.owner, inputs.repo, inputs.project);

  // Check Columns Project Source
  const name_column = inputs.column.split(',')
  const column = await getProjectColumns(inputs.token, project.id)
  const check_column = name_column.filter((name_column) => ! column.options.some((option) => option.name === name_column))
  if (check_column.length > 0 ) {
    console.log("########### Error: Some columns were not found in the project: ["+check_column.toString()+"] ###############")
    process.exit(1)
  }

  // Get Cards
  const cards = await getProjectCards(inputs.token, project.id, name_column);
  await closeIssuesRepo(inputs.token, cards)

  showLog("Done")
}

async function getRepositoryProjects(token, owner, repo, projectName) {
  // Get Projects From Repo
  let queryRepo = `{
    repository(owner: "`+owner+`", name: "`+repo+`") {
      projectsV2(first: 10) {
        nodes {
          id
          title
        }
      }
    }
    }`

  const { repository } = await execQuery(token, 'queryRepo', queryRepo);
  const projects = repository?.projectsV2?.nodes

  if (projects?.length===0) {
    console.log("########### Error: No projects found in repo: ["+owner+"/"+repo+"] ###############")
    process.exit(1)
  }

  const projectFiltred = projects.filter((p) => p.title === projectName).pop()

  if (!projectFiltred) {
    console.log("########### Error: Project was not found in repo ["+owner+"/"+repo+"] with name: ["+projectName+"] ###############")
    process.exit(1)
  } else {
    console.log("########### Project found in repo ["+owner+"/"+repo+"] with name: ["+projectName+"] id: ["+projectFiltred.id+"] ###############")
  }

  return projectFiltred
}

async function closeIssuesRepo(token, cards) {
  let mutations = []
  for (let card of cards) {
      console.log("############## Closing Issue Card: ["+ card.content.title +"] ##################")
      let mutation = `MyMutation` + card.content.id.replaceAll('-', '').replaceAll('_', '0') + `: closeIssue(input: { issueId: "` + card.content.id + `", stateReason: COMPLETED }) {clientMutationId}`
      if (mutation) mutations.push(mutation)
  }
  if (mutations.length) {
    await runMutations(token, mutations);
  } else {
    console.log('########### No Issue Cards to be close ##############')
  }
  return mutations.length;
}


async function runMutations(token, mutations) {
  let perPage = 10;
  const chunkMutations = sliceIntoChunks(mutations, perPage);
  let clientMutationsId = []
  for (chunk of chunkMutations) {
    const queryMutation = `mutation {` + chunk.join('\n') + `}`;
    const clientMutationId = await execQuery(token, 'queryMutation', queryMutation);
    for (const [key, value] of Object.entries(clientMutationId)) {
      clientMutationsId.push(value)
    }
  }
  // consolelog('clientMutationsId', clientMutationsId)
  return clientMutationsId
}

async function getProjectCards(token, projectId, name_columns, no_status = false) {
  let perPage = 100;
  let hasNextPage = false
  let endCursor = ''
  let cards = []
  do {
    let queryEndCursor = endCursor !== '' ? `, after: "` + endCursor + `"` : '';

    const queryGetCards = `{
      node(id: "` + projectId + `") {
        ... on ProjectV2 {
          items(first: ` + perPage + queryEndCursor + `) {
            nodes {
              type
              id
              content {
                  ... on Issue {
                      id
                      url
                      title
                      state
                  }
              }
              fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                      field {
                          ... on ProjectV2SingleSelectField {
                              id
                              name
                          }
                      }
                      name
                      optionId
                  }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }`

    const {node} = await execQuery(token, 'queryGetCards', queryGetCards);
    let filtred_cards = node?.items?.nodes.filter((card) => {
         return card.fieldValueByName !== null &&
          card.type === 'ISSUE' &&
          card.content.state !== 'CLOSED' &&
          name_columns.includes(card.fieldValueByName.name)
        }
    )
    if (filtred_cards.length) {
      cards = [...cards, ...filtred_cards]
    }

    let pageInfo = node.items.pageInfo;
    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;

  } while (hasNextPage)

  return cards
}


async function getProjectColumns(token, projectId) {
  let perPage = 50;
  let hasNextPage = false
  let endCursor = ''
  let columns = {}
  do {
    // Get Card Of Project
    let queryEndCursor = endCursor !== '' ? `, after: "` + endCursor + `"` : '';

    const queryGetColumns = `{
      node(id: "` + projectId + `") {
        ... on ProjectV2 {
          fields(first: ` + perPage + queryEndCursor + `) {
            nodes {
                ... on ProjectV2SingleSelectField {
                    id
                    name
                    options(names: null) {
                        id
                        name
                    }
                }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }`
    const {node} = await execQuery(token, 'queryGetColumns', queryGetColumns);

    columns = node?.fields?.nodes.filter((field) => field.name === STATUS_FIELD).pop();
    let pageInfo = node.fields.pageInfo;

    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;
  } while (hasNextPage)

  return columns;
}

async function run() {
  try {
    const inputs = {
      token: core.getInput('github-token', {required: true}),
      debug: core.getInput('debug', {required: false}),
      owner: core.getInput('repo', {required: true}).split('/')[0],
      repo: core.getInput('repo', {required: true}).split('/')[1],
      project: core.getInput('project', {required: true}),
      column: core.getInput('column', {required: true}),
    };

    await processWithInputs(inputs);

  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function sliceIntoChunks(arr, chunkSize) {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}

function showQuery(title, query) {
  if (debugEnabled) {
    console.log('################ ' + title + ' ##################');
    console.log(query);
  }
}

function showDebug(message, ...optionalParams) {
  if (debugEnabled) {
    console.log(message, ...optionalParams)
  }
}

function showLog(message, ...optionalParams) {
  if (optionalParams) {
    console.log('-----------------', message, '-------------------', ...optionalParams)
  } else {
    console.log(message, ...optionalParams)
  }
}

function consolelog(title, message) {
    console.log('-----------------', title, '-------------------')
    console.dir(message, {depth:null})
    console.log('-----------------/', title, '-------------------')
}

if (!process.env.local) {
  console.log('running pipe', process.env.local)
  run()
}

module.exports = { processWithInputs }