/**
 * outputs/ 보존 정책 스크립트
 *
 * 기본은 **미리보기(dry-run)** 이고, 실제 삭제는 --apply 를 붙여야 한다.
 *
 *   npm run clean:outputs                     # 30일 지난 폴더 미리보기
 *   npm run clean:outputs -- --days 7         # 7일 기준 미리보기
 *   npm run clean:outputs -- --days 7 --apply # 실제 삭제
 *   npm run clean:outputs -- --days 7 --keep 3 --apply  # 최근 3개는 무조건 보존
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
const FOLDER_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{3,31}$/;

function parseArgs(argv) {
  const options = { days: 30, keep: 0, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--days') options.days = Number(argv[++i]);
    else if (arg === '--keep') options.keep = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else {
      console.error(`알 수 없는 옵션: ${arg}`);
      options.help = true;
    }
  }
  if (!Number.isFinite(options.days) || options.days < 0) {
    console.error('--days 값이 올바르지 않습니다.');
    options.help = true;
  }
  if (!Number.isFinite(options.keep) || options.keep < 0) {
    console.error('--keep 값이 올바르지 않습니다.');
    options.help = true;
  }
  return options;
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(target);
    else if (entry.isFile()) {
      try { total += fs.statSync(target).size; } catch (e) { /* 무시 */ }
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function printHelp() {
  console.log(`사용법: node scripts/clean_outputs.js [--days 30] [--keep 0] [--apply]

  --days N   N일 이상 지난 폴더를 대상으로 (기본 30)
  --keep N   최근 N개 폴더는 나이와 무관하게 보존 (기본 0)
  --apply    실제로 삭제 (없으면 미리보기만)`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(OUTPUTS_DIR)) {
    console.log(`outputs 디렉터리가 없습니다: ${OUTPUTS_DIR}`);
    return;
  }

  const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;

  const folders = fs.readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && FOLDER_PATTERN.test(entry.name))
    .map(entry => {
      const dir = path.join(OUTPUTS_DIR, entry.name);
      const stat = fs.statSync(dir);
      return { name: entry.name, dir, mtime: stat.mtimeMs, size: directorySize(dir) };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const keepSet = new Set(folders.slice(0, options.keep).map(f => f.name));
  const targets = folders.filter(f => !keepSet.has(f.name) && f.mtime < cutoff);

  console.log(`outputs 폴더 ${folders.length}개 · 기준 ${options.days}일 · 보존 ${options.keep}개`);
  if (targets.length === 0) {
    console.log('삭제 대상이 없습니다.');
    return;
  }

  let totalBytes = 0;
  for (const target of targets) {
    totalBytes += target.size;
    const date = new Date(target.mtime).toISOString().slice(0, 10);
    console.log(` - ${target.name}  (${date}, ${formatBytes(target.size)})`);
  }

  console.log(`\n대상 ${targets.length}개 · 합계 ${formatBytes(totalBytes)}`);

  if (!options.apply) {
    console.log('미리보기입니다. 실제 삭제하려면 --apply 를 붙여 실행하세요.');
    return;
  }

  for (const target of targets) {
    fs.rmSync(target.dir, { recursive: true, force: true });
  }
  console.log(`✅ ${targets.length}개 폴더를 삭제했습니다.`);
}

main();
