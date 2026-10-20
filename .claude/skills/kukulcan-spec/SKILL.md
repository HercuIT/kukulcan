---
name: kukulcan-spec
description: Write a Kukulcan feature spec as a Claude Doc before building — gather the Linear issue, the CLAUDE.md template and the specs it depends on, write every section, then add the README Specs row and post the link on the Linear issue. Use when the user asks to create, write or draft specs for a ticket or story (HTE-<n>, VCR-<n>, WFPR-<n>).
---

# Kukulcan feature spec

Features are specified before they're built. Each spec is a Claude Doc.

## 1. Gather

- The ticket ID and title. Read the Linear issue (`HTE-<n>`) with the `linear` MCP server when it's available.
- The section template in `CLAUDE.md` ("Writing specs"). It is authoritative: use its sections, in its order, with its names.
- The specs this one depends on or affects, from the README's "Specs" table (for example HTE-113 is the base for the version-controlled specs VCR-018, HTE-14, HTE-16 and HTE-18). Read them so the new spec doesn't contradict them.
- The code and schema it touches: the migrations, `src/backend/*Api.js`, the compiler, the Dashboard.

## 2. Write the doc

- Title: `<TICKET>: <short name>`, for example `HTE-115: Material id on canvas nodes`.
- Create the doc's skeleton first, then fill each section of the template.
- Use the README's Glossary terms exactly: Workflow, Node, Connection, Node definition, ISA-88 levels, Parameter, Rule set, Roles. For the Equipment hierarchy, follow its containment table.
- Say clearly what's out of scope. Changing the Ignition XML contract (`recibirXML`) is a non-goal unless the story says otherwise.
- For every database change, state the RLS and RPC rules, which role can do what in which status, and the error codes (`28000`, `42501`, `P0002`, `P0001`).
- List open questions, each with a proposed default, so building can start with those defaults if nobody answers.
- Include acceptance criteria that can become the test plan in `docs/<TICKET>-testing.md`.

## 3. Publish it

- Add a row to the README's "Specs" table: the ticket, `[title](doc link)`, and a status such as "Draft", "Draft, depends on X", "Draft; open questions pending" or "Implemented on `<branch>` (PR #n)".
- Post the doc link as a comment on the Linear issue.
- Tell the user the doc is private until they share it from the page's Share menu, so teammates can't open it before then.
