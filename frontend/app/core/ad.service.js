(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('AdService', ['$http', '$q', 'ApiService', '$timeout', function ($http, $q, ApiService, $timeout) {
      var cachedData = null;
      var pendingPromise = null;
      var googleScriptInjected = false;

      function loadAds(force) {
        if (!force && cachedData) {
          return $q.resolve(cachedData);
        }
        if (pendingPromise) {
          return pendingPromise;
        }

        pendingPromise = ApiService.get('/public/ads').then(function (res) {
          cachedData = res.data || { settings: {}, partner_ads: [] };
          pendingPromise = null;
          maybeInjectGoogleAdSense(cachedData.settings);
          return cachedData;
        }, function (err) {
          pendingPromise = null;
          // Fallback safe default
          cachedData = {
            settings: {
              ads_enabled: true,
              google_ads_enabled: true,
              google_ads_client_id: 'ca-pub-6412959828302194',
              google_ads_slots: {
                home_leaderboard: '4892019283',
                home_mid: '7193028491',
                nominees_top: '1003003003',
                nominee_profile: '1004004004',
                voting_page: '1005005005',
                results_page: '1006006006',
                sidebar: '9382019482'
              },
              partner_ads_enabled: true,
              partner_ads_rotation_seconds: 6,
              ad_banner_style: 'hybrid'
            },
            partner_ads: []
          };
          return cachedData;
        });

        return pendingPromise;
      }

      function maybeInjectGoogleAdSense(settings) {
        if (!settings || !settings.google_ads_enabled || !settings.google_ads_client_id) return;
        if (googleScriptInjected) return;
        var existing = document.querySelector('script[data-adsbygoogle]');
        if (existing) {
          googleScriptInjected = true;
          return;
        }

        try {
          var s = document.createElement('script');
          s.type = 'text/javascript';
          s.async = true;
          s.crossOrigin = 'anonymous';
          s.setAttribute('data-adsbygoogle', 'true');
          s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(settings.google_ads_client_id);
          document.head.appendChild(s);
          googleScriptInjected = true;
        } catch (e) {
          // ignore in sandboxed environments
        }
      }

      return {
        load: loadAds,
        getCached: function () {
          return cachedData;
        },
        refresh: function () {
          return loadAds(true);
        }
      };
    }]);
})();
