# Incorrect Society Shopify Theme

![Shop Logo](assets/logo.png)

A custom Shopify theme for Incorrect Society with a modern, minimal, retro-inspired UX. Built for flexibility, performance, and easy customization.

---

## Project structure (current)

```
incorrect-society-theme/
├── assets/                # Theme images, icons, and critical CSS
│   ├── critical.css
│   ├── favicon.ico
│   ├── flag-pt.svg
│   ├── flag-us.svg
│   ├── hoodie-diagram.svg
│   ├── icon-account.svg
│   ├── icon-cart.svg
│   ├── logo.png
│   ├── shoppy-x-ray.svg
│   └── tshirt-diagram.svg
├── blocks/                # Custom Liquid blocks
│   ├── group.liquid
│   └── text.liquid
├── config/                # Theme settings and schema
│   ├── settings_data.json
│   └── settings_schema.json
├── layout/                # Main theme layout files
│   ├── password.liquid
│   └── theme.liquid
├── locales/               # Languages and translations
│   ├── en.default.json
│   ├── en.default.schema.json
│   └── pt-PT.json
├── sections/              # Theme sections (homepage, product, cart, etc.)
│   ├── 404.liquid
│   ├── announcement-bar.liquid
│   ├── article.liquid
│   ├── blog.liquid
│   ├── cart.liquid
│   ├── collection.liquid
│   ├── collections.liquid
│   ├── contact-us-section.liquid
│   ├── custom-section.liquid
│   ├── footer-group.json
│   ├── footer.liquid
│   ├── header-group.json
│   ├── header.liquid
│   ├── page.liquid
│   ├── password.liquid
│   ├── policy-page.liquid
│   ├── product-grid.liquid
│   ├── product.liquid
│   ├── search.liquid
│   ├── sidebar-navigation.liquid
│   └── sizing-guide.liquid
├── snippets/              # Reusable Liquid snippets
│   ├── 404-content.liquid
│   ├── contact-us-content.liquid
│   ├── css-variables.liquid
│   ├── image.liquid
│   ├── meta-tags.liquid
│   ├── music-player.liquid
│   ├── newsletter-content.liquid
│   ├── newsletter-modal.liquid
│   ├── price.liquid
│   ├── return-policy-content.liquid
│   ├── shipping-policy-content.liquid
│   ├── size-measurements.liquid
│   ├── social-icons.liquid
│   └── terms-of-service-content.liquid
├── templates/             # Page templates (JSON and Liquid)
│   ├── 404.json
│   ├── article.json
│   ├── blog.json
│   ├── cart.json
│   ├── challenge.liquid
│   ├── collection.json
│   ├── contact-us.liquid
│   ├── gift_card.liquid
│   ├── index.json
│   ├── list-collections.json
│   ├── page.contact-us.liquid
│   ├── page.contact.liquid
│   ├── page.json
│   ├── page.newsletter.json
│   ├── page.return-policy.json
│   ├── page.shipping-policy.json
│   ├── page.size-guide.json
│   ├── page.terms-of-service.json
│   ├── password.json
│   ├── product.json
│   ├── search.json
│   ├── unsubscribe.liquid
│   └── customers/
│       └── subscribe.liquid
├── CODE_OF_CONDUCT.md     # Community guidelines
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE.md             # License information
└── README.md              # Project documentation (this file)
```

---

## Features

- Minimal, accessible UI with responsive layout and SVG icons
- Multi-language support (English, Portuguese) via `locales/`
- Customizable theme settings (`config/settings_schema.json`)
- Product details accordion and model info on product pages
- Password page with countdown to a fixed Lisbon time and clean release state
- Lightweight newsletter modal with logo, centered content, and localized “check email” copy
- Minimal music player (rotating CD) with autoplay-on-interaction, persistence across navigation, and per-session shuffled playlist
- Left sidebar optimized for mobile with smooth internal scrolling

---

## Getting started

1. Clone the repository
2. Zip and upload the theme in Shopify admin, or use Shopify CLI for local dev
3. Customize in Theme Editor; adjust settings in `config/`
4. Update assets and snippets as needed; translations live in `locales/`

---

## Customization

- Logo: replace `assets/logo.png` if desired
- Music player: edit `snippets/music-player.liquid` to change playlist/links
- Sections & snippets: modify files in `sections/` and `snippets/`
- Metafields: define in Shopify admin and reference in sections/snippets

---

## License & contributions

- License: see [LICENSE.md](LICENSE.md)
