(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thPagination', {
      bindings: {
        meta: '<',
        onPage: '&'
      },
      template: [
        '<div class="flex-between mt-2" ng-if="$ctrl.meta && $ctrl.meta.pages > 1">',
        '  <span class="muted">Page {{ $ctrl.meta.page }} of {{ $ctrl.meta.pages }} ({{ $ctrl.meta.total }} records)</span>',
        '  <div class="inline-actions">',
        '    <button type="button" class="btn btn-sm btn-secondary" ng-disabled="!$ctrl.meta.has_prev" ng-click="$ctrl.onPage({page: $ctrl.meta.page - 1})">&larr; Previous</button>',
        '    <button type="button" class="btn btn-sm btn-secondary" ng-disabled="!$ctrl.meta.has_next" ng-click="$ctrl.onPage({page: $ctrl.meta.page + 1})">Next &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('')
    });
})();
