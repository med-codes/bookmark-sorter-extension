/**
 * Auto Git Sync Watcher
 * Watches the repository for changes and automatically commits & pushes to GitHub.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_DIR = __dirname;
const DEBOUNCE_MS = 4000; // Wait 4 seconds after changes settle before committing
const IGNORED_PATHS = ['.git', 'node_modules', '.tmp'];

let timeoutId = null;
let pendingFiles = new Set();

function shouldIgnore(filename) {
  if (!filename) return true;
  for (const ign of IGNORED_PATHS) {
    if (filename.startsWith(ign) || filename.includes(path.sep + ign)) return true;
  }
  return false;
}

function syncToGitHub() {
  try {
    const status = execSync('git status --porcelain', { cwd: REPO_DIR, encoding: 'utf8' }).trim();
    if (!status) {
      console.log('⚡ No unstaged git changes detected.');
      return;
    }

    const changedList = Array.from(pendingFiles).slice(0, 3).join(', ');
    const moreCount = pendingFiles.size > 3 ? ` (+${pendingFiles.size - 3} more)` : '';
    const now = new Date().toLocaleTimeString();
    const commitMsg = `auto-sync: update ${changedList || 'files'}${moreCount} at ${now}`;

    console.log(`\n📦 Staging changes...`);
    execSync('git add .', { cwd: REPO_DIR, stdio: 'inherit' });

    console.log(`💾 Committing: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_DIR, stdio: 'inherit' });

    console.log(`🚀 Pushing to origin main...`);
    execSync('git push origin main', { cwd: REPO_DIR, stdio: 'inherit' });

    console.log(`✅ Push successful at ${new Date().toLocaleTimeString()}!\n`);
  } catch (err) {
    console.error(`❌ Auto-sync failed: ${err.message}`);
  } finally {
    pendingFiles.clear();
  }
}

console.log(`👀 Watching ${REPO_DIR} for changes...`);
console.log(`🔄 Auto-push is active. Commits will be pushed automatically to origin main.\n`);

fs.watch(REPO_DIR, { recursive: true }, (eventType, filename) => {
  if (shouldIgnore(filename)) return;

  pendingFiles.add(filename);
  console.log(`📝 Detected change in: ${filename}`);

  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(syncToGitHub, DEBOUNCE_MS);
});
