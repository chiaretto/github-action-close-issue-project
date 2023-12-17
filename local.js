require('dotenv').config();

const idx = require("./index");

const inputs = {
    token: process.env.GITHUB_TOKEN,
    debug: 'false',
    owner: process.env.REPO.split('/')[0],
    repo: process.env.REPO.split('/')[1],
    project: process.env.PROJECT,
    column: process.env.COLUMN,
  };

if (process.env.local) {
  console.log('running local');
  idx.processWithInputs(inputs)
}