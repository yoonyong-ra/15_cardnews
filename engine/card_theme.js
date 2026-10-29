/**
 * 카드뉴스 색상 테마 유틸리티
 * 사용자가 고른 배경/타이틀/강조 3색에서 파생 색상(보더, 카드 배경, CTA 등)을 계산한다.
 */

const DEFAULT_THEME = {
  bg: '#F7F5F0',
  title: '#191A1E',
  accent: '#D9532F'
};

function normalizeHex(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const to = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

// t=0 → a, t=1 → b
function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r * (1 - t) + cb.r * t,
    g: ca.g * (1 - t) + cb.g * t,
    b: ca.b * (1 - t) + cb.b * t
  });
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function buildCardThemeVars(theme = {}) {
  const bg = normalizeHex(theme.bg, DEFAULT_THEME.bg);
  const title = normalizeHex(theme.title, DEFAULT_THEME.title);
  const accent = normalizeHex(theme.accent, DEFAULT_THEME.accent);
  const isDark = luminance(bg) < 0.45;

  return {
    '--bg-sand': bg,
    '--text-main': title,
    '--accent-terracotta': accent,
    '--accent-terracotta-soft': rgba(accent, 0.12),
    '--accent-blue': accent,
    '--accent-blue-soft': rgba(accent, 0.12),

    '--text-muted': mix(title, bg, 0.36),
    '--text-light': mix(title, bg, 0.52),
    '--border-subtle': mix(title, bg, 0.86),
    '--border-focus': rgba(accent, 0.45),
    '--texture-dot': mix(title, bg, 0.84),

    '--bg-card': isDark ? mix(bg, '#FFFFFF', 0.08) : mix(bg, '#FFFFFF', 0.7),
    '--bg-card-glass': isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.88)',

    '--avatar-text': bg,
    '--cta-bg': title,
    '--cta-text': bg,
    '--cta-subtext': rgba(bg, 0.75),
    '--cta-chip-bg': rgba(bg, 0.14),

    '--placeholder-from': isDark ? mix(bg, '#000000', 0.18) : mix(bg, '#FFFFFF', 0.45),
    '--placeholder-to': isDark ? mix(bg, '#000000', 0.35) : mix(bg, '#E4DED2', 0.6),
    '--placeholder-glow': rgba(accent, 0.16),
    '--placeholder-pattern': rgba(title, 0.05),

    '--shadow-soft': isDark
      ? '0 12px 36px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25)'
      : '0 12px 36px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.02)',
    '--shadow-card': isDark
      ? '0 20px 48px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.3)'
      : '0 20px 48px rgba(25, 26, 30, 0.06), 0 4px 12px rgba(25, 26, 30, 0.03)'
  };
}

module.exports = { DEFAULT_THEME, buildCardThemeVars, normalizeHex };
