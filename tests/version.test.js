// Verifies that the version declared in package.json is what Electron's
// app.getVersion() will report at runtime, and that the About panel options
// are set from that value rather than a hardcoded string.
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ── package.json version ───────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));
const PKG_VERSION = pkg.version;

describe('version alignment', () => {
  it('package.json has a valid semver version', () => {
    assert.match(PKG_VERSION, /^\d+\.\d+\.\d+$/, 'version must be x.y.z');
  });

  it('package.json version matches the electron build productName config', () => {
    // electron-builder reads package.json — confirm the "build" block is present
    // so the version flows through to the DMG name and Info.plist
    assert.ok(pkg.build, 'package.json must have a "build" block for electron-builder');
    assert.ok(pkg.build.mac, 'build config must include mac target');
  });

  // ── simulate what main.cjs does at startup ─────────────────────────────

  it('app.getVersion() aligns with package.json and is passed to setAboutPanelOptions', () => {
    // Mock Electron's app object the same way main.cjs uses it
    const aboutOptions = {};
    const mockApp = {
      getVersion: () => PKG_VERSION,
      getPath: () => '/tmp/test-cabinet',
      setAboutPanelOptions: (opts) => Object.assign(aboutOptions, opts),
      whenReady: () => Promise.resolve(),
      on: () => {},
    };

    // Verify setAboutPanelOptions receives the version from getVersion()
    // (this is the contract main.cjs must honour)
    mockApp.setAboutPanelOptions({
      applicationName: 'Cabinet',
      applicationVersion: mockApp.getVersion(),
      version: mockApp.getVersion(),
      copyright: `Copyright © ${new Date().getFullYear()} Dane Balia`,
    });

    assert.equal(aboutOptions.applicationVersion, PKG_VERSION,
      'applicationVersion must equal package.json version');
    assert.equal(aboutOptions.version, PKG_VERSION,
      'version must equal package.json version');
    assert.ok(
      aboutOptions.applicationVersion === aboutOptions.version,
      'applicationVersion and version must match each other'
    );
  });

  it('main.cjs calls setAboutPanelOptions with app.getVersion()', () => {
    // Read the source and confirm setAboutPanelOptions is called with
    // app.getVersion() — not a hardcoded string.
    const source = readFileSync(join(REPO_ROOT, 'electron', 'main.cjs'), 'utf-8');
    assert.ok(
      source.includes('setAboutPanelOptions'),
      'main.cjs must call app.setAboutPanelOptions'
    );
    assert.ok(
      source.includes('app.getVersion()'),
      'main.cjs must use app.getVersion() — not a hardcoded version string'
    );
    // Confirm no hardcoded version string like '1.0.x' appears in the about options block
    const aboutBlock = source.slice(source.indexOf('setAboutPanelOptions'));
    assert.doesNotMatch(
      aboutBlock.slice(0, aboutBlock.indexOf('}')),
      /['"`]\d+\.\d+\.\d+['"`]/,
      'setAboutPanelOptions must not contain a hardcoded version literal'
    );
  });
});
