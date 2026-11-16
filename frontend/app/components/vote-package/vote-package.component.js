(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thVotePackage', {
      bindings: {
        pkg: '<',
        selected: '<',
        onSelect: '&'
      },
      template: [
        '<button type="button" class="package-card btn-block" ng-class="{selected: $ctrl.selected}" ng-click="$ctrl.onSelect({pkg: $ctrl.pkg})">',
        '  <span class="package-popular-tag" ng-if="$ctrl.pkg.is_featured">Most Popular</span>',
        '  <div class="package-qty">{{ $ctrl.pkg.vote_quantity }} {{ $ctrl.pkg.vote_quantity === 1 ? "Vote" : "Votes" }}</div>',
        '  <div class="muted" style="font-size:0.8rem;">{{ $ctrl.pkg.name }}</div>',
        '  <div class="package-price">{{ $ctrl.pkg.price_major | ghsCurrency:$ctrl.pkg.currency }}</div>',
        '</button>'
      ].join('')
    });
})();
