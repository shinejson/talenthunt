(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminEliminationsController', ['$location', 'ApiService', 'ToastService',
      function ($location, ApiService, ToastService) {
        var vm = this;
        vm.rounds = [];
        vm.selectedRoundId = $location.search().round || '';
        vm.preview = null;
        vm.finalForm = { confirmed: false, publish_results: true, notes: '', is_correction: false };

        ApiService.get('/admin/rounds').then(function (res) {
          vm.rounds = res.data || [];
          if (!vm.selectedRoundId && vm.rounds.length) {
            for (var i = 0; i < vm.rounds.length; i++) {
              if (vm.rounds[i].status === 'OPEN') {
                vm.selectedRoundId = vm.rounds[i].id;
                break;
              }
            }
            if (!vm.selectedRoundId) vm.selectedRoundId = vm.rounds[0].id;
          }
          if (vm.selectedRoundId) vm.loadPreview();
        });

        vm.loadPreview = function () {
          if (!vm.selectedRoundId) return;
          ApiService.get('/admin/eliminations/' + vm.selectedRoundId + '/preview').then(function (res) {
            vm.preview = res.data;
          }, function (err) { ToastService.error(err.message); });
        };

        vm.finalise = function () {
          if (!vm.finalForm.confirmed) {
            ToastService.error('Please tick the confirmation checkbox before finalising.');
            return;
          }
          ApiService.post('/admin/eliminations/' + vm.selectedRoundId + '/finalise', vm.finalForm).then(function () {
            ToastService.success('Round results finalised as immutable snapshot!');
            vm.finalForm.confirmed = false;
            vm.loadPreview();
          }, function (err) { ToastService.error(err.message); });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/eliminations.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Round Elimination Preview &amp; Finalisation</h1>',
        '      <div class="form-group"><label class="form-label">Select Round</label><select class="form-control" ng-model="vm.selectedRoundId" ng-change="vm.loadPreview()"><option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.sequence_no }}. {{ r.name }} ({{ r.status }})</option></select></div>',
        '      <div ng-if="vm.preview">',
        '        <div class="alert alert-warning" ng-repeat="anom in vm.preview.anomalies">&#9888; {{ anom }}</div>',
        '        <div class="grid-4 mb-2">',
        '          <div class="kpi-card"><div class="kpi-label">Rule</div><div class="kpi-value" style="font-size:1.2rem;">{{ vm.preview.rules_applied.method | uppercase }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Qualifying</div><div class="kpi-value">{{ vm.preview.summary.qualified_count }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Eliminated</div><div class="kpi-value">{{ vm.preview.summary.eliminated_count }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Advances To</div><div class="kpi-value" style="font-size:1rem;">{{ vm.preview.next_round ? vm.preview.next_round.name : "Finale / End" }}</div></div>',
        '        </div>',

        '        <div class="table-responsive mb-3">',
        '          <table class="data-table">',
        '            <thead><tr><th>Rank</th><th>Nominee</th><th>Category</th><th>Ledger Votes</th><th>Judge Score</th><th>Projected Outcome</th><th>Rule Basis</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="row in vm.preview.results">',
        '                <td><strong>{{ row.rank ? ("#" + row.rank) : "-" }}</strong></td>',
        '                <td><strong>{{ row.public_name }}</strong></td>',
        '                <td>{{ row.category_name }}</td>',
        '                <td><strong>{{ row.votes | number }}</strong></td>',
        '                <td>{{ row.judge_score }}</td>',
        '                <td><th-status-badge status="row.outcome"></th-status-badge></td>',
        '                <td class="muted">{{ row.reason }}</td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',

        '        <form class="card" style="background:var(--bg-subtle);" ng-submit="vm.finalise()">',
        '          <h3 style="margin-top:0;">Authorised Finalisation &amp; Snapshot</h3>',
        '          <div class="form-group"><label class="form-label">Confirmation / Audit Notes</label><input type="text" class="form-control" ng-model="vm.finalForm.notes" placeholder="e.g. Verified after 30-min reconciliation window" /></div>',
        '          <div class="checkbox-row"><input type="checkbox" id="pubRes" ng-model="vm.finalForm.publish_results" /><label for="pubRes">Publish finalised round results publicly</label></div>',
        '          <div class="checkbox-row" ng-if="vm.preview.historical_runs.length"><input type="checkbox" id="corrRun" ng-model="vm.finalForm.is_correction" /><label for="corrRun">Execute as explicit audited Correction Run (preserves prior snapshot)</label></div>',
        '          <div class="checkbox-row"><input type="checkbox" id="confFin" ng-model="vm.finalForm.confirmed" /><label for="confFin"><strong>I confirm these results, freeze this round, and advance qualifiers.</strong></label></div>',
        '          <button type="submit" class="btn btn-primary">Confirm &amp; Finalise Round Snapshot</button>',
        '        </form>',
        '      </div>',
        '    </div>',

        '    <div class="card" ng-if="vm.preview && vm.preview.historical_runs.length">',
        '      <h3 style="margin-top:0;">Historical Finalised Snapshots</h3>',
        '      <div ng-repeat="run in vm.preview.historical_runs" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '        <div class="flex-between"><strong>{{ run.status }} Snapshot &bull; {{ run.executed_at | date:"medium" }}</strong><span class="muted">By {{ run.executed_by_name }}</span></div>',
        '        <div class="muted" style="font-size:0.86rem;">{{ run.notes }}</div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
