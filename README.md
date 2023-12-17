# github-action-close-issue-project

This action will close all issues on that column.

> ps: This action only close card of ISSUE.

## Inputs

### `github-token`: `${{ secrets.GITHUB_TOKEN }}`
**Required** 
### `repo`: `${{ github.repository  }}`
**Required**
### `project`: `Project Source Name`
**Required**
### `column`: `ColumnSource1`
**Required**

## Example usage

```
name: Github Close Issues From Column Done

on:
  workflow_dispatch:
    inputs:
      debug:
        type: choice
        options:
          - true
          - false

jobs:
  sync-project:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
      repository-projects: write
    steps:
      - name: Sync Projects
        uses: chiaretto/github-action-close-issue-project
        with:
          github-token: "${{ secrets.ACCESS_TOKEN }}"
          repo: "${{ github.repository }}"
          project: "Project Eng"
          column: "Ready For Production"
          debug: "${{ github.event.inputs.debug }}"
```