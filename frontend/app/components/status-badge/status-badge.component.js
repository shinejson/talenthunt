(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thStatusBadge', {
      bindings: {
        status: '<'
      },
      template: '<span class="status-badge" ng-class="$ctrl.badgeClass()"><span>{{ $ctrl.symbol() }}</span> {{ $ctrl.label() }}</span>',
      controller: function () {
        var vm = this;

        var SUCCESS_SET = { ACTIVE: 1, APPROVED: 1, NOMINATED: 1, QUALIFIED: 1, WINNER: 1, PAID: 1, SUCCESS: 1, OPEN: 1, APPLICATIONS_OPEN: 1, VOTING: 1, PROCESSED: 1, FINALIZED: 1, RESOLVED: 1, CREDIT: 1 };
        var WARN_SET = { SUBMITTED: 1, UNDER_REVIEW: 1, CHANGES_REQUESTED: 1, PENDING: 1, PENDING_PAYMENT: 1, INITIALIZED: 1, RECONCILIATION: 1, RESULTS_PENDING: 1, SCHEDULED: 1, INVESTIGATING: 1, IN_PROGRESS: 1, ADJUSTMENT: 1 };
        var DANGER_SET = { REJECTED: 1, ELIMINATED: 1, DISQUALIFIED: 1, FAILED: 1, QUARANTINED: 1, REFUNDED: 1, SUSPENDED: 1, HIDDEN: 1, REMOVED: 1, REVERSAL: 1 };

        vm.badgeClass = function () {
          var s = String(vm.status || '').toUpperCase();
          if (SUCCESS_SET[s]) return 'badge-success';
          if (WARN_SET[s]) return 'badge-warning';
          if (DANGER_SET[s]) return 'badge-danger';
          return 'badge-neutral';
        };

        vm.symbol = function () {
          var s = String(vm.status || '').toUpperCase();
          if (s === 'WINNER') return '★';
          if (SUCCESS_SET[s]) return '●';
          if (WARN_SET[s]) return '◐';
          if (DANGER_SET[s]) return '▲';
          return '○';
        };

        vm.label = function () {
          return String(vm.status || 'UNKNOWN').replace(/_/g, ' ');
        };
      }
    });
})();
