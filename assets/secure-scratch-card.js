(function () {
  function init(root) {
    if (root.dataset.scratchReady) return;
    root.dataset.scratchReady = 'true';
    var strings = JSON.parse(root.dataset.strings || '{}');
    var dialog = root.querySelector('[data-scratch-dialog]');
    var open = root.querySelector('[data-scratch-open]');
    var close = root.querySelector('[data-scratch-close]');
    var action = root.querySelector('[data-scratch-action]');
    var copy = root.querySelector('[data-scratch-copy]');
    var card = root.querySelector('[data-scratch-card]');
    var result = root.querySelector('[data-scratch-result]');
    var canvas = root.querySelector('[data-scratch-canvas]');
    var campaignId = root.dataset.campaignId;
    var endpoint = (window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/') + root.dataset.proxyPath.replace(/^\/+/, '');
    var revealed = false;

    function setTeaserState(state) {
      root.dataset.scratchState = state;
      if (state === 'played') {
        open.title = strings.alreadyPlayed;
        open.setAttribute('aria-label', strings.alreadyPlayed);
      } else {
        open.removeAttribute('title');
        open.removeAttribute('aria-label');
      }
    }

    function request(route) {
      var url = endpoint + '/' + route + '?campaignId=' + encodeURIComponent(campaignId);
      return fetch(url, {
        method: route === 'state' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: route === 'state' ? undefined : JSON.stringify({ campaignId: campaignId })
      }).then(function (response) {
        return response.json().catch(function () {
          return { error: 'invalid_proxy_response' };
        }).then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      });
    }

    function setCopy(value) { copy.textContent = value; }
    function showAction(label, handler) {
      action.hidden = false;
      action.textContent = label;
      action.onclick = handler;
    }

    function resetForStateCheck() {
      card.hidden = true;
      card.classList.remove('is-scratching', 'is-revealed');
      action.hidden = true;
      action.onclick = null;
      canvas.hidden = true;
      setCopy(strings.loading || '…');
    }

    function showOutcome(data) {
      setTeaserState('played');
      card.hidden = false; card.classList.remove('is-scratching'); card.classList.add('is-revealed');
      action.hidden = true;
      canvas.hidden = true;
      result.textContent = '';
      if (data.state === 'rewarded') {
        var isUsed = Boolean(data.used);
        var isExpired = !isUsed && data.expiresAt && (new Date(data.expiresAt).getTime() <= Date.now());

        if (isUsed) {
          setCopy(strings.alreadyPlayedUsed || 'Code successfully used on your order.');
        } else if (isExpired) {
          setCopy(strings.alreadyPlayedExpired || 'This card has expired.');
        } else {
          setCopy(strings.alreadyPlayed || strings.noPrize);
        }

        var message = document.createElement('div');
        message.className = 'secure-scratch__prize-value';
        message.textContent = (data.amountCents / 100).toFixed(0) + ' €';

        var details = document.createElement('div');
        details.className = 'secure-scratch__details';

        var code = document.createElement('code');
        code.className = 'secure-scratch__code';
        code.textContent = data.code;

        var expiry = document.createElement('small');
        expiry.dataset.expiresAt = data.expiresAt;

        var button = document.createElement('button');
        button.type = 'button'; button.className = 'secure-scratch__copy'; button.textContent = strings.copy;

        if (isUsed) {
          details.classList.add('is-used');
          code.classList.add('is-used');
          expiry.classList.add('is-used');
          expiry.textContent = strings.used || 'USED';
          button.classList.add('is-used');
          button.textContent = strings.used || 'USED';
          button.disabled = true;
        } else {
          button.addEventListener('click', function () {
            navigator.clipboard.writeText(data.code).then(function () { button.textContent = strings.copied; });
          });
          updateExpiry(expiry, details, button);
        }

        details.append(code, expiry, button);
        result.append(message, details);
      } else {
        setCopy(strings.noPrize || strings.alreadyPlayed);
        var noPrizeEl = document.createElement('div');
        noPrizeEl.className = 'secure-scratch__prize-value secure-scratch__prize-value--no-prize';
        noPrizeEl.textContent = strings.noPrize;
        result.append(noPrizeEl);
      }
    }

    function updateExpiry(node, details, button) {
      var remaining = Math.max(0, new Date(node.dataset.expiresAt).getTime() - Date.now());
      if (!remaining) {
        node.textContent = strings.expired || 'EXPIRED';
        node.classList.add('is-expired');
        if (details) details.classList.add('is-expired');
        if (button) {
          button.textContent = strings.expired || 'EXPIRED';
          button.disabled = true;
          button.classList.add('is-expired');
        }
        if (strings.alreadyPlayedExpired) setCopy(strings.alreadyPlayedExpired);
        return;
      }
      var minutes = Math.floor(remaining / 60000); var seconds = Math.floor((remaining % 60000) / 1000);
      node.textContent = strings.expires + ': ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
      window.setTimeout(function () { updateExpiry(node, details, button); }, 1000);
    }

    function beginScratch(data) {
      revealed = false;
      card.hidden = false;
      card.classList.remove('is-revealed');
      card.classList.add('is-scratching');
      card.style.setProperty('--scratch-progress', '0%');
      action.hidden = true;
      canvas.hidden = false;
      canvas.classList.remove('is-fading');
      setCopy(strings.scratch);

      result.textContent = '';
      if (data && data.state === 'rewarded') {
        var message = document.createElement('div');
        message.className = 'secure-scratch__prize-value';
        message.textContent = (data.amountCents / 100).toFixed(0) + ' €';

        var details = document.createElement('div');
        details.className = 'secure-scratch__details';
        details.style.display = 'none';

        var code = document.createElement('code');
        code.className = 'secure-scratch__code';
        code.textContent = data.code;

        var expiry = document.createElement('small');
        expiry.dataset.expiresAt = data.expiresAt;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'secure-scratch__copy';
        button.textContent = strings.copy;
        button.addEventListener('click', function () {
          navigator.clipboard.writeText(data.code).then(function () {
            button.textContent = strings.copied;
          });
        });

        details.append(code, expiry, button);
        result.append(message, details);
        updateExpiry(expiry, details, button);
      } else {
        var noPrizeEl = document.createElement('div');
        noPrizeEl.className = 'secure-scratch__prize-value secure-scratch__prize-value--no-prize';
        noPrizeEl.textContent = strings.noPrize;
        result.append(noPrizeEl);
      }

      var rect = canvas.getBoundingClientRect();
      var width = Math.round(rect.width || card.offsetWidth || 360);
      var height = Math.round(rect.height || card.offsetHeight || 218);
      var ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      var context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      var foil = context.createLinearGradient(0, 0, width, height);
      foil.addColorStop(0, '#521126');
      foil.addColorStop(.22, '#c22d5c');
      foil.addColorStop(.5, '#711530');
      foil.addColorStop(.76, '#e04978');
      foil.addColorStop(1, '#5a1028');
      context.fillStyle = foil;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = .22;
      context.strokeStyle = '#fff';
      context.lineWidth = 1;
      for (var stripe = -height; stripe < width; stripe += 10) {
        context.beginPath();
        context.moveTo(stripe, 0);
        context.lineTo(stripe + height, height);
        context.stroke();
      }
      context.restore();

      context.save();
      context.strokeStyle = 'rgba(255,255,255,.72)';
      context.lineWidth = 1;
      context.strokeRect(15, 15, width - 30, height - 30);
      context.fillStyle = '#fff';
      context.textAlign = 'left';
      for (var mark = 0; mark < 3; mark += 1) {
        context.save();
        context.translate(31 + mark * 10, 32);
        context.transform(1, 0, -.28, 1, 0, 0);
        context.fillRect(0, 0, 6, 21);
        context.restore();
      }
      context.textAlign = 'right';
      context.font = '700 8px Century Gothic, sans-serif';
      context.fillText('SECRETS + SINNERS // DROP 2026', width - 30, 35);
      context.fillStyle = '#fff';
      context.textAlign = 'center';
      context.font = '700 10px Century Gothic, sans-serif';
      context.fillText('ERASE THE SURFACE', width / 2, height / 2 - 17);
      context.font = '700 20px Century Gothic, sans-serif';
      context.fillText(strings.scratch, width / 2, height / 2 + 13);
      context.font = '400 9px Century Gothic, sans-serif';
      context.fillText('REVEAL YOUR RESULT', width / 2, height / 2 + 33);
      context.restore();

      var drawing = false;
      var lastPoint = null;
      var lastCheck = 0;

      function revealProgress() {
        var sample = context.getImageData(0, 0, canvas.width, canvas.height).data;
        var step = Math.max(8, Math.round(ratio * 12));
        var transparent = 0;
        var total = 0;
        for (var y = 0; y < canvas.height; y += step) {
          for (var x = 0; x < canvas.width; x += step) {
            total += 1;
            if (sample[(y * canvas.width + x) * 4 + 3] < 32) transparent += 1;
          }
        }
        var progress = total ? transparent / total : 0;
        card.style.setProperty('--scratch-progress', Math.min(100, progress * 100) + '%');
        return progress;
      }

      function finishReveal() {
        if (revealed) return;
        revealed = true;
        setTeaserState('played');
        setCopy(strings.alreadyPlayed || strings.noPrize);
        canvas.classList.add('is-fading');
        window.setTimeout(function () {
          canvas.hidden = true;
          canvas.classList.remove('is-fading');
          card.classList.remove('is-scratching');
          card.classList.add('is-revealed');
          var details = result.querySelector('.secure-scratch__details');
          if (details) {
            details.style.display = '';
          }
        }, 350);
      }

      function sparkle(x, y) {
        var spark = document.createElement('i');
        spark.className = 'secure-scratch__spark';
        spark.style.left = x + 'px';
        spark.style.top = y + 'px';
        spark.style.setProperty('--spark-x', ((Math.random() * 28) - 14) + 'px');
        spark.style.setProperty('--spark-y', ((Math.random() * 28) - 14) + 'px');
        card.appendChild(spark);
        window.setTimeout(function () { spark.remove(); }, 700);
      }

      function scratch(event) {
        if (!drawing || revealed) return;
        var r = canvas.getBoundingClientRect();
        var point = event.touches ? event.touches[0] : event;
        var x = point.clientX - r.left;
        var y = point.clientY - r.top;
        context.globalCompositeOperation = 'destination-out';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = 46;
        context.beginPath();
        context.moveTo(lastPoint ? lastPoint.x : x, lastPoint ? lastPoint.y : y);
        context.lineTo(x, y);
        context.stroke();
        context.beginPath();
        context.arc(x, y, 23, 0, Math.PI * 2);
        context.fill();
        lastPoint = { x: x, y: y };
        sparkle(x, y);
        var now = Date.now();
        if (now - lastCheck > 160) {
          lastCheck = now;
          if (revealProgress() >= .68) {
            finishReveal();
          }
        }
      }

      canvas.onpointerdown = function (event) {
        if (revealed) return;
        drawing = true;
        lastPoint = null;
        canvas.setPointerCapture(event.pointerId);
        scratch(event);
      };
      canvas.onpointermove = scratch;
      canvas.onpointerup = canvas.onpointercancel = function () {
        drawing = false;
        lastPoint = null;
        if (!revealed && revealProgress() >= .58) {
          finishReveal();
        }
      };
    }

    function startGame() {
      action.disabled = true;
      setCopy(strings.loading || '…');
      request('start').then(function (start) {
        if (!start.ok) {
          action.disabled = false;
          showState(start);
          return;
        }
        if (start.data && (start.data.state === 'rewarded' || start.data.state === 'no_prize')) {
          action.disabled = false;
          showOutcome(start.data);
          return;
        }
        request('reveal').then(function (reveal) {
          action.disabled = false;
          if (reveal.ok && (reveal.data.state === 'rewarded' || reveal.data.state === 'no_prize')) {
            beginScratch(reveal.data);
          } else if (reveal.ok && reveal.data.state === 'processing') {
            action.disabled = true;
            setCopy(strings.loading || '…');
            window.setTimeout(function () {
              request('reveal').then(function (retryReveal) {
                action.disabled = false;
                if (retryReveal.ok && (retryReveal.data.state === 'rewarded' || retryReveal.data.state === 'no_prize')) {
                  beginScratch(retryReveal.data);
                } else {
                  showState(retryReveal);
                }
              }).catch(function (err) {
                action.disabled = false;
                console.error('[ScratchCard] Reveal retry error:', err);
                setCopy(strings.error);
                showAction(strings.retry || strings.start, startGame);
              });
            }, 800);
          } else {
            showState(reveal);
          }
        }).catch(function (err) {
          action.disabled = false;
          console.error('[ScratchCard] Reveal error:', err);
          setCopy(strings.error);
          showAction(strings.retry || strings.start, startGame);
        });
      }).catch(function (err) {
        action.disabled = false;
        console.error('[ScratchCard] Start error:', err);
        setCopy(strings.error);
        showAction(strings.retry || strings.start, startGame);
      });
    }

    function showState(reply) {
      if (reply.status === 401 || (reply.data && reply.data.error === 'login_required')) {
        setCopy(strings.login);
        showAction(strings.login, function () { window.location.assign(root.dataset.loginUrl); });
        return;
      }
      if (!reply.ok) {
        console.warn('[ScratchCard] Server error state:', reply);
        setCopy(strings.error);
        showAction(strings.retry || strings.start, loadState);
        return;
      }
      if (reply.data.state === 'rewarded' || reply.data.state === 'no_prize') {
        showOutcome(reply.data);
        return;
      }
      if (reply.data.state === 'blocked') {
        setCopy(strings.blocked);
        action.hidden = true;
        return;
      }
      if (reply.data.state === 'started' || reply.data.state === 'processing') {
        setTeaserState('active');
        setCopy(strings.loading || '…');
        action.disabled = true;
        request('reveal').then(function (reveal) {
          action.disabled = false;
          if (reveal.ok && (reveal.data.state === 'rewarded' || reveal.data.state === 'no_prize')) {
            beginScratch(reveal.data);
          } else {
            console.error('[ScratchCard] Reveal state in showState:', reveal);
            setCopy(strings.error);
            showAction(strings.retry || strings.start, loadState);
          }
        }).catch(function (err) {
          action.disabled = false;
          console.error('[ScratchCard] Reveal error in showState:', err);
          setCopy(strings.error);
          showAction(strings.retry || strings.start, loadState);
        });
        return;
      }
      setTeaserState('ready');
      setCopy(strings.intro || copy.textContent);
      showAction(strings.start, startGame);
    }

    function loadState() {
      resetForStateCheck();
      request('state').then(showState).catch(function () { setCopy(strings.error); showAction(strings.retry || strings.start, loadState); });
    }

    function syncTeaserState() {
      request('state').then(function (reply) {
        if (!reply.ok) return;
        if (reply.data.state === 'rewarded' || reply.data.state === 'no_prize') setTeaserState('played');
      }).catch(function () {});
    }

    open.addEventListener('click', function () { dialog.showModal(); loadState(); });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    syncTeaserState();
  }
  function boot() { document.querySelectorAll('[data-secure-scratch]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('shopify:section:load', boot);
})();
