import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import { isJsonObject, jsonText, type JsonValue } from '@keystone/core';
import { desktopPlatform, readText } from '../platform/desktop';
import page from '../platform/desktop.ts?raw';
import commands from '../../src-tauri/src/commands.json';
import native from '../../src-tauri/src/lib.rs?raw';

// The desktop platform against a stand-in for the native side (src-tauri/src/lib.rs), which answers Tauri's own calls
// by command name: what Keystone does when there is no saved state yet, and when there is one it cannot read.

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer;

/** The commands the page asked the native side for, in order. */
const asked: string[] = [];

/**
 * A computer whose data folder (/data) holds these files; `unreadable` ones are there and refuse to be read, and with
 * `blind` it cannot even look. It refuses the way the native side does: with a plain sentence, not an Error.
 */
function computer(files: Map<string, string>, unreadable: string[] = [], blind = false) {
  mockIPC((command, payload) => {
    const args: JsonValue = JSON.parse(JSON.stringify(payload ?? null));
    const path = isJsonObject(args) ? jsonText(args.path) : '';

    asked.push(command);

    switch (command) {
      case 'plugin:path|resolve_directory':
        return '/data';
      case 'plugin:path|join':
        return isJsonObject(args) && Array.isArray(args.paths) ? args.paths.map(jsonText).join('/') : '';
      case 'cpu_arch':
        return 'aarch64';
      case 'print_pdf':
        return bytesOf('%PDF-1.7');
      case 'file_exists':
        if (blind) throw `Cannot look for ${path}: Permission denied (os error 13)`;

        return files.has(path) || unreadable.includes(path);
      case 'read_file':
        if (!files.has(path)) throw `Cannot read ${path}: Permission denied (os error 13)`;

        return bytesOf(files.get(path) ?? '');
      default:
        throw `No command ${command}.`;
    }
  });
}

afterEach(() => {
  clearMocks();
  asked.length = 0;
});

describe('the desktop platform reading the saved state', () => {
  it('answers null when nothing is saved yet, without trying to read', async () => {
    computer(new Map());

    expect(await desktopPlatform('macos').loadState()).toBeNull();
    expect(asked).not.toContain('read_file');
  });

  it('reads the saved state from state.json in the data folder', async () => {
    computer(new Map([['/data/state.json', '{"dir":[]}']]));

    expect(await desktopPlatform('windows').loadState()).toBe('{"dir":[]}');
  });

  it('stops with a sentence when the file is there and cannot be read, never answering "nothing saved"', async () => {
    computer(new Map(), ['/data/state.json']);

    await expect(desktopPlatform('macos').loadState()).rejects.toThrow(
      'Keystone could not read its saved records, so it did not open with none in their place. Cannot read /data/state.json: Permission denied (os error 13)',
    );
  });

  it('stops with a sentence when it cannot even tell whether the file is there', async () => {
    computer(new Map(), [], true);

    await expect(readText('/data/state.json')).rejects.toThrow(
      'Keystone could not look for its saved records, so it did not open with none in their place. Cannot look for /data/state.json: Permission denied (os error 13)',
    );
    expect(asked).not.toContain('read_file');
  });

  it('hands a damaged file over as it is: the store decides what a state is', async () => {
    computer(new Map([['/data/state.json', '{ not json']]));

    expect(await readText('/data/state.json')).toBe('{ not json');
  });

  it('still shows no photo for one that is missing or cannot be read', async () => {
    computer(new Map(), ['/data/photos/card.jpg']);

    expect(await desktopPlatform('macos').photoUrl('card.jpg')).toBeNull();
    expect(await desktopPlatform('macos').photoUrl('none.jpg')).toBeNull();
  });
});

describe('the desktop platform printing a page to a PDF', () => {
  it('asks the native side on Windows, where WebView2 prints the page with its text kept', async () => {
    computer(new Map());
    const pdf = await desktopPlatform('windows').printPdf?.();

    expect(new TextDecoder().decode(pdf)).toBe('%PDF-1.7');
    expect(asked).toContain('print_pdf');
  });

  it('cannot on a Mac, so Export PDF draws the paper there instead', () => {
    computer(new Map());

    expect(desktopPlatform('macos').printPdf).toBeUndefined();
  });
});

// The page asks the native side for a command by name, and a name the native side does not know fails only on
// someone's desk. The names are written once, in src-tauri/src/commands.json; `cargo test` holds the same file to
// what `run` registers (the_commands_the_page_names_are_the_ones_registered).
describe('the native commands', () => {
  const named = Object.values(commands);
  const registered = /\.invoke_handler\(tauri::generate_handler!\[([^\]]+)\]/.exec(native)?.[1].split(',').map((x) => x.trim()) ?? [];

  it('are the ones the native side registers, each a command there', () => {
    expect([...named].sort()).toEqual([...registered].sort());
    expect(new Set(named).size).toBe(named.length);

    for (const name of named) expect(native, name).toMatch(new RegExp(`#\\[tauri::command\\]\\n(async )?fn ${name}\\(`));
  });

  it('are asked for by the names in that file, never spelled in the page', () => {
    for (const name of named) expect(page, name).not.toContain(`'${name}'`);

    expect(page).not.toMatch(/invoke(<[^>]+>)?\(['"`]/);
  });
});
