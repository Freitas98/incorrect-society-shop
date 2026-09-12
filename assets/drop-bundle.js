(function () {
  function normalise(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function optionValue(variant, position) {
    return variant['option' + position];
  }

  function sizePositions(options) {
    var positions = options.reduce(function (matches, option, index) {
      if (/size|tamanho/i.test(option)) matches.push(index + 1);
      return matches;
    }, []);
    return positions.length >= 2 ? positions.slice(0, 2) : positions;
  }

  function setStatus(status, message, visible) {
    status.textContent = message || '';
    status.hidden = !visible;
  }

  function initialise(card) {
    if (card.dataset.dropBundleReady) return;
    card.dataset.dropBundleReady = 'true';

    var dataElement = card.querySelector('[data-drop-bundle-data]');
    var button = card.querySelector('[data-drop-bundle-add]');
    var price = card.querySelector('[data-drop-bundle-price]');
    var status = card.querySelector('[data-drop-bundle-status]');
    var selects = Array.prototype.slice.call(card.querySelectorAll('[data-drop-bundle-size]'));
    if (!dataElement || !button || selects.length !== 2) return;

    var data;
    try {
      data = JSON.parse(dataElement.textContent);
    } catch (_) {
      return;
    }

    function selectedSizes() {
      return selects.map(function (select) { return normalise(select.value); });
    }

    function matchingVariant() {
      var sizes = selectedSizes();
      var positions = sizePositions(data.options || []);

      // A legacy one-size-option bundle can only represent matching sizes.
      // It remains purchasable for its existing configuration, but never
      // pretends to fulfil a mixed-size selection.
      if (positions.length === 1) {
        if (sizes[0] !== sizes[1]) return null;
        return data.variants.find(function (variant) {
          return normalise(optionValue(variant, positions[0])) === sizes[0];
        });
      }
      if (positions.length !== 2) return null;
      return data.variants.find(function (variant) {
        return normalise(optionValue(variant, positions[0])) === sizes[0]
          && normalise(optionValue(variant, positions[1])) === sizes[1];
      });
    }

    function selectionLabel(select) {
      var label = select.closest('label');
      var name = label && label.querySelector('span') ? label.querySelector('span').textContent.trim() : '';
      return name ? name + ': ' + select.value : select.value;
    }

    function unavailableSelections() {
      var positions = sizePositions(data.options || []);
      if (positions.length !== 2) return [];
      return selects.reduce(function (unavailable, select, index) {
        var selectedSize = normalise(select.value);
        var hasAvailableSize = data.variants.some(function (variant) {
          return variant.available && normalise(optionValue(variant, positions[index])) === selectedSize;
        });
        if (!hasAvailableSize) unavailable.push(selectionLabel(select));
        return unavailable;
      }, []);
    }

    function unavailableMessage() {
      var unavailable = unavailableSelections();
      var labels = unavailable.length ? unavailable : selects.map(selectionLabel);
      var template = unavailable.length
        ? card.dataset.unavailableSizeTemplate
        : card.dataset.unavailableCombinationTemplate;
      return (template || card.dataset.unavailableText).replace('___SIZES___', labels.join(' · '));
    }

    function update() {
      var variant = matchingVariant();
      var available = Boolean(variant && variant.available);
      button.disabled = !available;
      button.dataset.variantId = available ? variant.id : '';
      price.textContent = available ? variant.priceHtml : '';
      setStatus(status, available ? '' : unavailableMessage(), !available);
    }

    selects.forEach(function (select) { select.addEventListener('change', update); });
    button.addEventListener('click', async function () {
      var variantId = Number(button.dataset.variantId);
      if (!variantId || button.disabled) return;
      button.disabled = true;
      try {
        if (!window.addItemsToCartAndUpdate) throw new Error('Cart service unavailable');
        await window.addItemsToCartAndUpdate([{ id: variantId, quantity: 1 }], 'bundle');
        setStatus(status, window.themeStrings?.added_to_cart || 'Added to cart!', true);
      } catch (error) {
        setStatus(status, error.message || window.themeStrings?.error_adding_to_cart || 'Error adding to cart.', true);
      } finally {
        update();
      }
    });
    update();
  }

  function boot() {
    document.querySelectorAll('[data-drop-bundle-card]').forEach(initialise);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
})();
