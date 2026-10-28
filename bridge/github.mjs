import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { z } from 'zod'

/**
 * GitHub notifications, read-only.
 *
 * Shell access stays behind ALLOW_WRITES, so `gh` is out of reach in the
 * default mode. This server is the narrow exception: one fixed, GET-only call
 * through the user's existing `gh` login, run with execFile (no shell), so the
 * model can choose a filter but never the command.
 */

const GH_CANDIDATES = [
  'C:\\Program Files\\GitHub CLI\\gh.exe',
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
]
const GH = GH_CANDIDATES.find((p) => existsSync(p)) ?? 'gh'

const DESCRIPTION = `List the user's GitHub notifications (read-only).

Returns each notification's repository, type (Issue, PullRequest, Release, ...),
title, reason, whether it is unread, when it was updated, and a link.

Use it for "check my GitHub notifications", "anything new on <repo>", "what's
happening on my <project> repo". Pass repo to narrow it to one repository — a
loose match is fine ("my guitar" matches "MyGuitar" or "my-guitar").

By default only unread notifications come back; set all=true to include ones
already read. This can only look — it cannot mark anything read, reply or merge.`

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** API urls (api.github.com/repos/o/r/pulls/1) to the page a person would open. */
function htmlUrl(n) {
  const api = n.subject?.url
  if (!api) return n.repository?.html_url ?? ''
  return api
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/')
}

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile(GH, args, { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()))
      else resolve(stdout)
    })
  })
}

export function githubServer() {
  return createSdkMcpServer({
    name: 'jarvis_github',
    version: '1.0.0',
    instructions: "The user's GitHub notifications, through their own gh login. Read-only.",
    alwaysLoad: true,
    tools: [
      tool(
        'list_notifications',
        DESCRIPTION,
        {
          repo: z
            .string()
            .optional()
            .catch(undefined)
            .describe('Optional repository name to filter by, loosely matched.'),
          all: z
            .boolean()
            .optional()
            .catch(undefined)
            .describe('Include notifications already read. Default false.'),
        },
        async (args) => {
          let raw
          try {
            raw = await runGh([
              'api', '-X', 'GET', 'notifications',
              '-f', `all=${args.all ? 'true' : 'false'}`,
              '-f', 'per_page=50',
            ])
          } catch (err) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: `GitHub could not be reached: ${err.message}. ` +
                  'If it mentions login, the user needs to run `gh auth login`.',
              }],
            }
          }

          let list = JSON.parse(raw)
          const want = squash(args.repo)
          if (want) {
            list = list.filter(
              (n) => squash(n.repository?.full_name).includes(want) || squash(n.repository?.name).includes(want),
            )
          }

          const items = list.map((n) => ({
            repo: n.repository?.full_name,
            type: n.subject?.type,
            title: n.subject?.title,
            reason: n.reason,
            unread: n.unread,
            updated: n.updated_at,
            url: htmlUrl(n),
          }))

          return {
            content: [{
              type: 'text',
              text: items.length
                ? JSON.stringify(items, null, 1)
                : `No ${args.all ? '' : 'unread '}notifications${want ? ` for "${args.repo}"` : ''}.`,
            }],
          }
        },
      ),
    ],
  })
}
