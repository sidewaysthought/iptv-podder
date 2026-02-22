<?php
// Cookie/analytics consent banner (GDPR/CCPA-ish)
// This site currently only uses GA4 analytics.
?>
<div
  id="consentBanner"
  class="hidden fixed inset-x-0 bottom-0 z-50 border-t border-sky-200 bg-gradient-to-r from-white via-sky-50 to-blue-100 text-slate-800 shadow-[0_-1px_0_rgba(148,163,184,0.35)]"
  role="region"
  aria-label="Privacy options"
>
  <div class="container mx-auto max-w-6xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="text-sm leading-5">
      <p class="font-semibold">Privacy notice</p>
      <p>
        We use analytics to understand site usage. You can accept or reject analytics cookies.
        See our <a class="text-slate-700 underline hover:no-underline" href="privacy.php">Privacy Policy</a>.
      </p>
    </div>

    <div class="flex gap-2">
      <button
        id="consentReject"
        type="button"
        class="px-3 py-2 border border-slate-300 rounded bg-white text-gray-800 hover:bg-slate-100 focus:outline-none focus:ring"
      >
        Reject
      </button>
      <button
        id="consentAccept"
        type="button"
        class="px-3 py-2 rounded border border-slate-300 bg-white text-gray-800 hover:bg-slate-100 focus:outline-none focus:ring"
      >
        Accept
      </button>
    </div>
  </div>
</div>

<script>
(function () {
  const KEY = 'vip_consent_analytics';

  function hide() {
    const el = document.getElementById('consentBanner');
    if (el) el.classList.add('hidden');
  }

  function show() {
    const el = document.getElementById('consentBanner');
    if (!el) return;
    el.classList.remove('hidden');
  }

  function setConsent(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      // If storage is blocked, we just won't persist.
    }
  }

  function getConsent() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const existing = getConsent();
    if (existing !== 'granted' && existing !== 'denied') {
      show();
    }

    const acceptBtn = document.getElementById('consentAccept');
    const rejectBtn = document.getElementById('consentReject');

    acceptBtn?.addEventListener('click', () => {
      setConsent('granted');
      hide();
      // Load GA now that consent is granted
      if (typeof window.__vip_ga_load === 'function') {
        window.__vip_ga_load();
      }
    });

    rejectBtn?.addEventListener('click', () => {
      setConsent('denied');
      hide();
      // Do not load GA.
    });
  });
})();
</script>
