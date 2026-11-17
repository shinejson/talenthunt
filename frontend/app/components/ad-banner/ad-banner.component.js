(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thAdBanner', {
      bindings: {
        slot: '@',
        format: '@',
        showGoogle: '<?',
        showPartner: '<?'
      },
      template: [
        '<div class="th-ad-banner" ng-class="[\'th-ad-format-\' + ($ctrl.format || \'leaderboard\'), {\'th-ad-hybrid\': $ctrl.isHybrid(), \'th-ad-loaded\': $ctrl.ready}]" ng-if="$ctrl.shouldShow()">',
        '  <div class="th-ad-header">',
        '    <div class="th-ad-disclosure">',
        '      <span class="th-ad-pill">&#9733; {{ $ctrl.settings.ad_disclosure_text || "Sponsored Showcase" }}</span>',
        '      <span class="th-ad-subtext" ng-if="$ctrl.activeTab === \'partner\' && $ctrl.currentAd">{{ $ctrl.currentAd.kind_label }}</span>',
        '      <span class="th-ad-subtext" ng-if="$ctrl.activeTab === \'google\'">Google Ads Network</span>',
        '    </div>',
        '    <div class="th-ad-controls" ng-if="$ctrl.canToggleTabs()">',
        '      <button type="button" class="th-ad-tab-btn" ng-class="{\'active\': $ctrl.activeTab === \'partner\'}" ng-click="$ctrl.setTab(\'partner\')">Official Partners</button>',
        '      <button type="button" class="th-ad-tab-btn" ng-class="{\'active\': $ctrl.activeTab === \'google\'}" ng-click="$ctrl.setTab(\'google\')">Google Ads</button>',
        '    </div>',
        '  </div>',

        '  <!-- PARTNER / SUPPORTER ADVERTISEMENT SLIDE -->',
        '  <div class="th-partner-ad-unit" ng-if="$ctrl.activeTab === \'partner\' && $ctrl.currentAd" ng-mouseenter="$ctrl.pauseRotation()" ng-mouseleave="$ctrl.resumeRotation()">',
        '    <a ng-href="{{ $ctrl.currentAd.target_url }}" target="{{ $ctrl.currentAd.website_url ? \'_blank\' : \'_self\' }}" rel="noopener noreferrer" class="th-partner-ad-link">',
        '      <div class="th-partner-ad-visual" ng-style="{\'background\': $ctrl.getBannerGradient($ctrl.currentAd)}">',
        '        <th-brand-mark org="$ctrl.currentAd" size="md"></th-brand-mark>',
        '      </div>',
        '      <div class="th-partner-ad-body">',
        '        <div class="th-partner-ad-meta">',
        '          <span class="th-partner-ad-badge" ng-style="{\'border-color\': $ctrl.currentAd.accent_color, \'color\': $ctrl.currentAd.accent_color}">{{ $ctrl.currentAd.badge_label }}</span>',
        '          <span class="th-partner-ad-location" ng-if="$ctrl.currentAd.location">&#128205; {{ $ctrl.currentAd.location }}</span>',
        '        </div>',
        '        <h4 class="th-partner-ad-title">{{ $ctrl.currentAd.name }}</h4>',
        '        <p class="th-partner-ad-copy">{{ $ctrl.currentAd.tagline || $ctrl.currentAd.description }}</p>',
        '      </div>',
        '      <div class="th-partner-ad-action">',
        '        <span class="th-partner-ad-btn">{{ $ctrl.currentAd.cta_label || "Explore" }} &rarr;</span>',
        '      </div>',
        '    </a>',

        '    <!-- ROTATION CAROUSEL CONTROLS -->',
        '    <div class="th-ad-carousel-nav" ng-if="$ctrl.adsList.length > 1">',
        '      <button type="button" class="th-ad-arrow th-ad-arrow-prev" ng-click="$ctrl.prevAd($event)" aria-label="Previous Sponsor Ad">&#8249;</button>',
        '      <div class="th-ad-dots">',
        '        <span ng-repeat="a in $ctrl.adsList" class="th-ad-dot" ng-class="{\'active\': $index === $ctrl.currentIndex}" ng-click="$ctrl.goToAd($index, $event)"></span>',
        '      </div>',
        '      <button type="button" class="th-ad-arrow th-ad-arrow-next" ng-click="$ctrl.nextAd($event)" aria-label="Next Sponsor Ad">&#8250;</button>',
        '    </div>',
        '  </div>',

        '  <!-- GOOGLE ADSENSE DISPLAY UNIT -->',
        '  <div class="th-google-ad-unit" ng-if="$ctrl.activeTab === \'google\'">',
        '    <div class="th-google-ad-container">',
        '      <!-- Live AdSense Tag -->',
        '      <ins class="adsbygoogle"',
        '           style="display:block"',
        '           data-ad-client="{{ $ctrl.settings.google_ads_client_id }}"',
        '           data-ad-slot="{{ $ctrl.slotId }}"',
        '           data-ad-format="auto"',
        '           data-full-width-responsive="true"></ins>',
        '      <!-- Fallback / Preview Badge for Developer & Sandbox Inspection -->',
        '      <div class="th-google-ad-preview">',
        '        <div class="th-google-badge-row">',
        '          <span class="th-google-logo-pill"><b>G</b>oogle Ads</span>',
        '          <span class="th-google-slot-tag">Slot: {{ $ctrl.slotId }} &bull; Client: {{ $ctrl.settings.google_ads_client_id }}</span>',
        '        </div>',
        '        <div class="th-google-preview-content">',
        '          <div class="th-google-creative-mock">',
        '            <div class="th-google-mock-icon">&#9889;</div>',
        '            <div>',
        '              <strong>Responsive Google Display Banner</strong>',
        '              <p>StageLight Ghana verified advertising slot. Live ads serve when approved by Google AdSense.</p>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''),
      controller: ['$scope', '$interval', '$timeout', 'AdService', function ($scope, $interval, $timeout, AdService) {
        var vm = this;
        vm.ready = false;
        vm.settings = {};
        vm.adsList = [];
        vm.currentIndex = 0;
        vm.currentAd = null;
        vm.slotId = '';
        vm.activeTab = 'partner';
        var timer = null;

        vm.$onInit = function () {
          AdService.load().then(function (data) {
            vm.settings = data.settings || {};
            vm.adsList = data.partner_ads || [];
            vm.ready = true;

            // Resolve slot ID
            var slotKey = vm.slot || 'home_leaderboard';
            var slots = vm.settings.google_ads_slots || {};
            vm.slotId = slots[slotKey] || '1001001001';

            // Determine active tab based on style preference
            var style = vm.settings.ad_banner_style || 'hybrid';
            if (vm.showGoogle && !vm.showPartner) {
              vm.activeTab = 'google';
            } else if (vm.showPartner && !vm.showGoogle) {
              vm.activeTab = 'partner';
            } else if (style === 'google_only' && vm.settings.google_ads_enabled) {
              vm.activeTab = 'google';
            } else {
              vm.activeTab = (vm.settings.partner_ads_enabled && vm.adsList.length) ? 'partner' : 'google';
            }

            if (vm.adsList.length > 0) {
              // Pick random starting index so different banners on the same page highlight different partners
              vm.currentIndex = Math.floor(Math.random() * vm.adsList.length);
              vm.currentAd = vm.adsList[vm.currentIndex];
              vm.startRotation();
            }

            // Trigger Google Ads push if tab is google
            if (vm.activeTab === 'google') {
              vm.pushGoogleAd();
            }
          });
        };

        vm.shouldShow = function () {
          if (!vm.ready) return false;
          if (vm.settings.ads_enabled === false) return false;
          var hasPartner = vm.settings.partner_ads_enabled && vm.adsList.length > 0;
          var hasGoogle = vm.settings.google_ads_enabled && Boolean(vm.settings.google_ads_client_id);
          return hasPartner || hasGoogle;
        };

        vm.isHybrid = function () {
          return (vm.settings.ad_banner_style === 'hybrid' || !vm.settings.ad_banner_style) &&
                 vm.settings.partner_ads_enabled &&
                 vm.settings.google_ads_enabled &&
                 vm.adsList.length > 0;
        };

        vm.canToggleTabs = function () {
          return vm.isHybrid();
        };

        vm.setTab = function (tab) {
          vm.activeTab = tab;
          if (tab === 'google') {
            vm.pauseRotation();
            vm.pushGoogleAd();
          } else {
            vm.startRotation();
          }
        };

        vm.startRotation = function () {
          vm.pauseRotation();
          if (!vm.adsList || vm.adsList.length <= 1) return;
          var seconds = parseInt(vm.settings.partner_ads_rotation_seconds, 10) || 6;
          timer = $interval(function () {
            vm.nextAd();
          }, seconds * 1000);
        };

        vm.pauseRotation = function () {
          if (timer) {
            $interval.cancel(timer);
            timer = null;
          }
        };

        vm.resumeRotation = function () {
          if (vm.activeTab === 'partner') {
            vm.startRotation();
          }
        };

        vm.nextAd = function ($event) {
          if ($event) $event.stopPropagation();
          if (!vm.adsList.length) return;
          vm.currentIndex = (vm.currentIndex + 1) % vm.adsList.length;
          vm.currentAd = vm.adsList[vm.currentIndex];
        };

        vm.prevAd = function ($event) {
          if ($event) $event.stopPropagation();
          if (!vm.adsList.length) return;
          vm.currentIndex = (vm.currentIndex - 1 + vm.adsList.length) % vm.adsList.length;
          vm.currentAd = vm.adsList[vm.currentIndex];
        };

        vm.goToAd = function (idx, $event) {
          if ($event) $event.stopPropagation();
          if (idx >= 0 && idx < vm.adsList.length) {
            vm.currentIndex = idx;
            vm.currentAd = vm.adsList[idx];
          }
        };

        vm.getBannerGradient = function (ad) {
          if (!ad) return 'linear-gradient(135deg, #1e293b, #0f172a)';
          var color = ad.accent_color || '#d97706';
          return 'linear-gradient(135deg, ' + color + '22, ' + color + '44)';
        };

        vm.pushGoogleAd = function () {
          $timeout(function () {
            try {
              if (window.adsbygoogle) {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
              }
            } catch (e) {
              // Handled by AdSense
            }
          }, 150, false);
        };

        $scope.$on('$destroy', function () {
          vm.pauseRotation();
        });
      }]
    });
})();
