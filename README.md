# Incorrect Society Shopify Theme

![Shop Logo](assets/logo.png)

A custom Shopify theme for Incorrect Society, designed for a modern, minimal, and retro-inspired shopping experience. This theme is built for flexibility, pixel-perfect design, and easy customization.

---

## Project Structure

```
incorrect-society-theme/
├── assets/                # Theme images, icons, and critical CSS
│   ├── critical.css
│   ├── favicon.png
│   ├── flag-pt.svg
│   ├── flag-us.svg
│   ├── hoodie-diagram.svg
│   ├── icon-account.svg
│   ├── icon-cart.svg
│   ├── logo.png
│   ├── shoppy-x-ray.svg
│   ├── tshirt-diagram.svg
├── blocks/                # Custom Liquid blocks
│   ├── group.liquid
│   ├── text.liquid
├── config/                # Theme settings and schema
│   ├── settings_data.json
│   ├── settings_schema.json
├── layout/                # Main theme layout files
│   ├── password.liquid
│   ├── theme.liquid
├── locales/               # Language and translation files
│   ├── en.default.json
│   ├── en.default.schema.json
│   ├── pt-PT.json
│   ├── pt.json
├── sections/              # Theme sections (homepage, product, cart, etc.)
│   ├── 404.liquid
│   ├── announcement-bar.liquid
│   ├── article.liquid
│   ├── blog.liquid
│   ├── cart.liquid
│   ├── collection.liquid
│   ├── collections.liquid
│   ├── custom-section.liquid
│   ├── footer-group.json
│   ├── footer.liquid
│   ├── header-group.json
│   ├── header.liquid
│   ├── hello-world.liquid
│   ├── page.liquid
│   ├── password.liquid
│   ├── policy-page.liquid
│   ├── product-grid.liquid
│   ├── product.liquid
│   ├── search.liquid
│   ├── sidebar-navigation.liquid
│   ├── sizing-guide.liquid
├── snippets/              # Reusable Liquid snippets
│   ├── css-variables.liquid
│   ├── image.liquid
│   ├── meta-tags.liquid
│   ├── music-player.liquid
│   ├── newsletter-content.liquid
│   ├── price.liquid
│   ├── shipping-policy-content.liquid
│   ├── size-measurements.liquid
│   ├── social-icons.liquid
│   ├── terms-of-service-content.liquid
├── templates/             # Page templates (JSON and Liquid)
│   ├── 404.json
│   ├── article.json
│   ├── blog.json
│   ├── cart.json
│   ├── challenge.liquid
│   ├── collection.json
│   ├── gift_card.liquid
│   ├── index.json
│   ├── list-collections.json
│   ├── page.json
│   ├── page.newsletter.json
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
├── README.md              # Project documentation (this file)
└── _trash/                # (Optional) Deprecated or backup files
```

---

## Features

- **Pixel-perfect, retro-inspired UI** with custom music player and SVG icons
- **Multi-language support** (English, Portuguese)
- **Customizable theme settings** via `config/settings_schema.json`
- **Reusable snippets** for pricing, newsletter, social icons, and more
- **Product metafield support** (e.g., Tecido, Cor, Tamanho)
- **Modern, responsive layout** for all devices
- **Accessible navigation and controls**

---

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone https://github.com/Freitas98/incorrect-society-shop.git
   ```
2. **Upload the theme to Shopify:**
   - Zip the theme folder and upload via Shopify admin, or use Shopify CLI for local development.
3. **Customize settings:**
   - Edit `config/settings_schema.json` and `settings_data.json` for theme options.
   - Update assets and snippets as needed.
4. **Translations:**
   - Edit files in `locales/` for language support.

---

## Customization

- **Logo:** Replace `assets/logo.png` with your own logo if desired.
- **Music Player:** Edit `snippets/music-player.liquid` for playlist and style.
- **Sections & Snippets:** Add or modify Liquid files in `sections/` and `snippets/` for custom features.
- **Metafields:** Add product/category metafields in Shopify admin and reference them in section files.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

See [LICENSE.md](LICENSE.md) for details.

---

## Contact

For questions or support, open an issue or contact the repository owner.
