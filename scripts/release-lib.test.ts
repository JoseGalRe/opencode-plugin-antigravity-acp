import { describe, expect, it } from 'vite-plus/test';

import { assetName, changelogSection, repositoryOf } from './release-lib.ts';

const CHANGELOG = `# opencode-plugin-antigravity-acp

## 0.2.0

### Minor Changes

- Something new.

## 0.1.0

### Minor Changes

- First release.
`;

describe('changelogSection', () => {
  it('takes the section of the version, up to the next version', () => {
    expect(changelogSection(CHANGELOG, '0.2.0')).toBe('### Minor Changes\n\n- Something new.');
    expect(changelogSection(CHANGELOG, '0.1.0')).toBe('### Minor Changes\n\n- First release.');
  });

  it('is missing for a version without a section, or an empty one', () => {
    expect(changelogSection(CHANGELOG, '0.3.0')).toBeNull();
    expect(changelogSection(CHANGELOG, '0.2')).toBeNull();
    expect(changelogSection('# x\n\n## 2.0.0\n\n## 1.0.0\n\n- x\n', '2.0.0')).toBeNull();
  });
});

describe('repositoryOf', () => {
  it('reads SSH and HTTP remotes', () => {
    const expected = { owner: 'josegalre', name: 'opencode-plugin-antigravity-acp' };

    expect(repositoryOf('localhost:josegalre/opencode-plugin-antigravity-acp.git')).toEqual(expected);
    expect(repositoryOf('ssh://gitea@127.0.0.1:753/josegalre/opencode-plugin-antigravity-acp.git')).toEqual(expected);
    expect(repositoryOf('http://127.0.0.1:7531/josegalre/opencode-plugin-antigravity-acp/\n')).toEqual(expected);
  });

  it('is unknown for a remote without owner and name', () => {
    expect(repositoryOf('')).toBeNull();
    expect(repositoryOf('localhost')).toBeNull();
  });
});

describe('assetName', () => {
  it('names the plugin file after the package and the version', () => {
    expect(assetName('opencode-plugin-antigravity-acp', '0.1.0')).toBe('opencode-plugin-antigravity-acp-0.1.0.js');
  });

  it('leaves the scope of a scoped package out of the file name', () => {
    expect(assetName('@josegalre/opencode-plugin-antigravity-acp', '0.4.1')).toBe('opencode-plugin-antigravity-acp-0.4.1.js');
  });
});
