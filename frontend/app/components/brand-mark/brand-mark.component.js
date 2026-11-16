(function () {
  'use strict';

  var HEX_RE = /^#[0-9a-fA-F]{6}$/;

  angular.module('talentHuntApp')
    .component('thBrandMark', {
      bindings: {
        org: '<',
        size: '@'
      },
      template: [
        '<div class="th-brand-mark" ng-class="[\'th-brand-mark-\' + ($ctrl.size || \'md\'), {\'has-logo\': $ctrl.showLogo()}]" ng-style="$ctrl.boxStyle">',
        '  <img ng-if="$ctrl.showLogo()" ng-src="{{ $ctrl.resolvedLogo }}" alt="{{ $ctrl.org.name || \'Brand\' }} logo" />',
        '  <span ng-if="!$ctrl.showLogo()" class="th-brand-mark-text">{{ $ctrl.initials() }}</span>',
        '</div>'
      ].join(''),
      controller: ['$element', '$scope', '$timeout', function ($element, $scope, $timeout) {
        var vm = this;
        vm.imgBroken = false;
        vm.resolvedLogo = null;
        vm.boxStyle = {};
        var lastUrl = null;
        var lastStyleKey = null;

        function bindErrorHandler() {
          $timeout(function () {
            var img = $element[0] && $element[0].querySelector('img');
            if (img && !img.__thBound) {
              img.__thBound = true;
              img.addEventListener('error', function () {
                $scope.$applyAsync(function () {
                  vm.imgBroken = true;
                });
              });
            }
          }, 0, false);
        }

        vm.$doCheck = function () {
          var rawUrl = null;
          if (vm.org) {
            rawUrl = vm.org.uploaded_logo_url || vm.org.logo_url || null;
            if (rawUrl && typeof rawUrl === 'string') {
              rawUrl = rawUrl.trim() || null;
            }
          }
          if (rawUrl !== lastUrl) {
            lastUrl = rawUrl;
            vm.resolvedLogo = rawUrl;
            vm.imgBroken = false;
            if (rawUrl) bindErrorHandler();
          }

          var hasLogo = Boolean(vm.resolvedLogo && !vm.imgBroken);
          var hex = (vm.org && vm.org.accent_color && HEX_RE.test(vm.org.accent_color))
            ? vm.org.accent_color
            : '#d97706';
          var styleKey = hasLogo ? 'logo' : hex;
          if (styleKey !== lastStyleKey) {
            lastStyleKey = styleKey;
            vm.boxStyle = hasLogo ? {} : {
              'background': 'linear-gradient(135deg, ' + hex + ' 0%, #0f172a 145%)',
              'border-color': hex
            };
          }
        };

        vm.showLogo = function () {
          return Boolean(vm.resolvedLogo && !vm.imgBroken);
        };

        vm.initials = function () {
          if (!vm.org) return 'SL';
          var custom = vm.org.brand_initials || vm.org.raw_brand_initials;
          if (custom && String(custom).trim()) {
            return String(custom).trim().toUpperCase().substring(0, 4);
          }
          var name = String(vm.org.name || '').trim();
          if (!name) return 'SL';
          var parts = name.split(/\s+/);
          if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
          var out = '';
          for (var i = 0; i < Math.min(3, parts.length); i++) {
            out += parts[i][0] || '';
          }
          return out.toUpperCase();
        };
      }]
    });
})();
