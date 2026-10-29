const fs = require('fs');
const path = require('path');
const { normalizeHex, DEFAULT_THEME } = require('./card_theme');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'user_settings.json');

const ANGLE_IDS = new Set([
  'angle_warning', 'angle_cheat', 'angle_easy', 'angle_vs',
  'angle_story', 'angle_target', 'angle_calc'
]);
const SLIDE_COUNTS = new Set(['4', '5', '6', '7', '8', '10']);

const DEFAULT_SETTINGS = {
  selectedAngleId: 'angle_warning',
  userFeedback: '',
  slideCount: '4',
  theme: { ...DEFAULT_THEME }
};

function sanitize(input = {}) {
  const theme = input.theme || {};
  return {
    selectedAngleId: ANGLE_IDS.has(input.selectedAngleId) ? input.selectedAngleId : DEFAULT_SETTINGS.selectedAngleId,
    userFeedback: typeof input.userFeedback === 'string' ? input.userFeedback.slice(0, 2000) : '',
    slideCount: SLIDE_COUNTS.has(String(input.slideCount)) ? String(input.slideCount) : DEFAULT_SETTINGS.slideCount,
    theme: {
      bg: normalizeHex(theme.bg, DEFAULT_THEME.bg),
      title: normalizeHex(theme.title, DEFAULT_THEME.title),
      accent: normalizeHex(theme.accent, DEFAULT_THEME.accent)
    }
  };
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { settings: { ...DEFAULT_SETTINGS, theme: { ...DEFAULT_THEME } }, exists: false };
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return { settings: sanitize(raw), exists: true };
  } catch (err) {
    console.warn(`[Settings] 읽기 실패: ${err.message}`);
    return { settings: { ...DEFAULT_SETTINGS, theme: { ...DEFAULT_THEME } }, exists: false };
  }
}

function saveSettings(patch = {}) {
  const current = loadSettings().settings;
  const merged = sanitize({
    ...current,
    ...patch,
    theme: { ...current.theme, ...(patch.theme || {}) }
  });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { DEFAULT_SETTINGS, loadSettings, saveSettings };
