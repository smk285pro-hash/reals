/** Tailwind v3 preset cho @reals/ui (stem-app dùng — main-app v4 đọc tokens.css trực tiếp).
 *
 * Dùng: tailwind.config.js của app:
 *   presets: [require('@reals/ui/tailwind.preset.js')]
 * → có utility `bg-reals-brand`, `text-reals-tier-max-fg`... bám vào tokens.css.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        reals: {
          brand: 'var(--reals-brand)',
          'brand-strong': 'var(--reals-brand-strong)',
          'brand-foreground': 'var(--reals-brand-foreground)',
          accent: 'var(--reals-accent)',
          'accent-strong': 'var(--reals-accent-strong)',
          bg: 'var(--reals-bg)',
          surface: 'var(--reals-surface)',
          'surface-border': 'var(--reals-surface-border)',
          text: 'var(--reals-text)',
          'text-muted': 'var(--reals-text-muted)',
          ok: 'var(--reals-ok)',
          warn: 'var(--reals-warn)',
          danger: 'var(--reals-danger)',
          'tier-free-bg': 'var(--reals-tier-free-bg)',
          'tier-free-fg': 'var(--reals-tier-free-fg)',
          'tier-free-border': 'var(--reals-tier-free-border)',
          'tier-basic-bg': 'var(--reals-tier-basic-bg)',
          'tier-basic-fg': 'var(--reals-tier-basic-fg)',
          'tier-basic-border': 'var(--reals-tier-basic-border)',
          'tier-max-bg': 'var(--reals-tier-max-bg)',
          'tier-max-fg': 'var(--reals-tier-max-fg)',
          'tier-max-border': 'var(--reals-tier-max-border)',
          'tier-ultra-bg': 'var(--reals-tier-ultra-bg)',
          'tier-ultra-fg': 'var(--reals-tier-ultra-fg)',
          'tier-ultra-border': 'var(--reals-tier-ultra-border)',
        },
      },
      borderRadius: {
        reals: 'var(--reals-radius-md)',
        'reals-full': 'var(--reals-radius-full)',
      },
      fontFamily: {
        reals: 'var(--reals-font-sans)',
      },
    },
  },
}
