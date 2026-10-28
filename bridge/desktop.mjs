import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'

/**
 * Opening a folder in File Explorer, allowed in read-only mode.
 *
 * Shell access stays behind ALLOW_WRITES. This is the narrow exception: it
 * only ever opens a window onto a folder. The path must be an existing
 * directory, because `explorer.exe <file>` would run that file, and execFile
 * means no shell is involved.
 */

const KNOWN = {
  home: homedir(),
  desktop: join(homedir(), 'Desktop'),
  documents: join(homedir(), 'Documents'),
  downloads: join(homedir(), 'Downloads'),
  pictures: join(homedir(), 'Pictures'),
  music: join(homedir(), 'Music'),
  videos: join(homedir(), 'Videos'),
}

const DESCRIPTION = `Open a folder in File Explorer on the user's PC.

Use it for "open my file explorer", "open my downloads", "show me D drive".
Pass folder as one of: ${Object.keys(KNOWN).join(', ')} — or a full path such as
D:\\ or C:\\Users\\name\\Projects. Leave it out to open File Explorer on This PC.

It only opens folders; it cannot open, run or change files.`

function isDir(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Desktop/Documents may live under OneDrive instead of the home folder. */
function knownFolder(name) {
  const local = KNOWN[name]
  const onedrive = join(homedir(), 'OneDrive', name[0].toUpperCase() + name.slice(1))
  return isDir(local) ? local : isDir(onedrive) ? onedrive : local
}

export function desktopServer() {
  if (process.platform !== 'win32') return null
  return createSdkMcpServer({
    name: 'jarvis_desktop',
    version: '1.0.0',
    instructions: "Opens folders in File Explorer on the user's Windows PC.",
    alwaysLoad: true,
    tools: [
      tool(
        'open_folder',
        DESCRIPTION,
        {
          folder: z
            .string()
            .optional()
            .catch(undefined)
            .describe('A known folder name or a full folder path. Omit for This PC.'),
        },
        async (args) => {
          const raw = String(args.folder ?? '').trim()
          const key = raw.toLowerCase()
          let target = null
          if (!raw || key === 'this pc' || key === 'computer') target = null
          else if (KNOWN[key]) target = knownFolder(key)
          else target = resolve(raw)

          if (target && !isDir(target)) {
            return {
              isError: true,
              content: [{ type: 'text', text: `There is no folder at ${target}.` }],
            }
          }

          execFile('explorer.exe', target ? [target] : [], { windowsHide: false }, () => {
            // explorer.exe exits non-zero even on success; nothing to report.
          })
          return {
            content: [{ type: 'text', text: `Opened ${target ?? 'This PC'} in File Explorer.` }],
          }
        },
      ),
    ],
  })
}
