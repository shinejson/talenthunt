(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminEliminationsController', ['$location', 'ApiService', 'ToastService', 'AdminFilterUtils',
      function ($location, ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.competitions = [];
        vm.rounds = [];
        vm.selectedCompId = '';
        vm.selectedRoundId = $location.search().round || '';
        vm.preview = null;
        vm.categories = [];
        vm.filters = {
          q: '',
          category: '',
          outcome: '',
          sim_method: '',
          sim_value: null
        };
        vm.finalForm = { confirmed: false, publish_results: true, notes: '', is_correction: false };

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
        });

        vm.loadRounds = function () {
          var params = vm.selectedCompId ? { competition_id: vm.selectedCompId } : {};
          ApiService.get('/admin/rounds', params).then(function (res) {
            vm.rounds = res.data || [];
            var found = false;
            for (var j = 0; j < vm.rounds.length; j++) {
              if (vm.rounds[j].id === vm.selectedRoundId) {
                found = true;
                break;
              }
            }
            if (!found) {
              vm.selectedRoundId = '';
              for (var i = 0; i < vm.rounds.length; i++) {
                if (vm.rounds[i].status === 'OPEN') {
                  vm.selectedRoundId = vm.rounds[i].id;
                  break;
                }
              }
              if (!vm.selectedRoundId && vm.rounds.length) vm.selectedRoundId = vm.rounds[0].id;
            }
            if (vm.selectedRoundId) vm.loadPreview();
            else vm.preview = null;
          });
        };

        vm.loadRounds();

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          var hadSim = !!vm.filters.sim_method;
          vm.filters = { q: '', category: '', outcome: '', sim_method: '', sim_value: null };
          if (hadSim) vm.loadPreview();
        };

        vm.loadPreview = function () {
          if (!vm.selectedRoundId) return;
          var params = {};
          if (vm.filters.sim_method) {
            params.method = vm.filters.sim_method;
            if (vm.filters.sim_value !== null && vm.filters.sim_value !== undefined && vm.filters.sim_value !== '') {
              if (vm.filters.sim_method === 'top_n') params.advance_count = vm.filters.sim_value;
              else if (vm.filters.sim_method === 'percentage') params.advance_percentage = vm.filters.sim_value;
              else if (vm.filters.sim_method === 'threshold') params.min_votes_threshold = vm.filters.sim_value;
            }
          }
          ApiService.get('/admin/eliminations/' + vm.selectedRoundId + '/preview', params).then(function (res) {
            vm.preview = res.data;
            var catSet = {};
            var cats = [];
            var rows = (vm.preview && vm.preview.results) || [];
            for (var i = 0; i < rows.length; i++) {
              if (rows[i].category_name && !catSet[rows[i].category_name]) {
                catSet[rows[i].category_name] = true;
                cats.push(rows[i].category_name);
              }
            }
            vm.categories = cats.sort();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.filteredResults = function () {
          if (!vm.preview || !vm.preview.results) return [];
          var q = (vm.filters.q || '').trim().toLowerCase();
          var cat = vm.filters.category;
          var out = vm.filters.outcome;
          return vm.preview.results.filter(function (row) {
            if (cat && row.category_name !== cat) return false;
            if (out && row.outcome !== out) return false;
            if (q) {
              var hay = ((row.public_name || '') + ' ' + (row.category_name || '') + ' ' + (row.reason || '')).toLowerCase();
              if (hay.indexOf(q) === -1) return false;
            }
            return true;
          });
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
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Round Elimination Preview &amp; Finalisation</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadPreview()"><th-icon name="refresh" size="14"></th-icon><span>Refresh Preview</span></button>',
        '      </div>',

        '      <div class="grid-2 mb-2">',
        '        <div class="form-group" style="margin-bottom:8px;">',
        '          <label class="form-label">Competition</label>',
        '          <select class="form-control" ng-model="vm.selectedCompId" ng-change="vm.loadRounds()">',
        '            <option value="">All Competitions</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group" style="margin-bottom:8px;">',
        '          <label class="form-label">Select Round</label>',
        '          <select class="form-control" ng-model="vm.selectedRoundId" ng-change="vm.loadPreview()">',
        '            <option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.sequence_no }}. {{ r.name }} ({{ r.status }})</option>',
        '          </select>',
        '        </div>',
        '      </div>',

        '      <div ng-if="vm.preview">',
        '        <div class="alert alert-warning" ng-repeat="anom in vm.preview.anomalies">&#9888; {{ anom }}</div>',
        '        <div class="grid-4 mb-2">',
        '          <div class="kpi-card"><div class="kpi-label">Rule</div><div class="kpi-value" style="font-size:1.2rem;">{{ vm.preview.rules_applied.method | uppercase }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Qualifying</div><div class="kpi-value">{{ vm.preview.summary.qualified_count }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Eliminated</div><div class="kpi-value">{{ vm.preview.summary.eliminated_count }}</div></div>',
        '          <div class="kpi-card"><div class="kpi-label">Advances To</div><div class="kpi-value" style="font-size:1rem;">{{ vm.preview.next_round ? vm.preview.next_round.name : "Finale / End" }}</div></div>',
        '        </div>',

        '        <div class="filter-bar">',
        '          <div class="filter-bar-top">',
        '            <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Standings &amp; Rule Simulation</span></span>',
        '            <div class="inline-actions">',
        '              <span class="filter-count-pill">{{ vm.filteredResults().length }} of {{ vm.preview.results.length }} nominee(s)</span>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '            </div>',
        '          </div>',
        '          <div class="filter-bar-grid">',
        '            <div class="filter-field-search">',
        '              <label class="filter-label">Search Nominee</label>',
        '              <div class="search-input-wrap">',
        '                <th-icon name="search" size="15"></th-icon>',
        '                <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" placeholder="Search nominee or rule basis..." />',
        '              </div>',
        '            </div>',
        '            <div class="filter-field">',
        '              <label class="filter-label">Category</label>',
        '              <select class="form-control form-control-sm" ng-model="vm.filters.category">',
        '                <option value="">All Categories</option>',
        '                <option ng-repeat="cat in vm.categories" value="{{ cat }}">{{ cat }}</option>',
        '              </select>',
        '            </div>',
        '            <div class="filter-field">',
        '              <label class="filter-label">Projected Outcome</label>',
        '              <select class="form-control form-control-sm" ng-model="vm.filters.outcome">',
        '                <option value="">All Outcomes</option>',
        '                <option value="QUALIFIED">QUALIFIED</option>',
        '                <option value="WINNER">WINNER</option>',
        '                <option value="ELIMINATED">ELIMINATED</option>',
        '                <option value="DISQUALIFIED">DISQUALIFIED</option>',
        '              </select>',
        '            </div>',
        '            <div class="filter-field">',
        '              <label class="filter-label">Simulate Method</label>',
        '              <select class="form-control form-control-sm" ng-model="vm.filters.sim_method" ng-change="vm.loadPreview()">',
        '                <option value="">Round Configured Rule</option>',
        '                <option value="top_n">Simulate Top N</option>',
        '                <option value="percentage">Simulate Top %</option>',
        '                <option value="threshold">Simulate Min Votes</option>',
        '              </select>',
        '            </div>',
        '            <div class="filter-field" ng-if="vm.filters.sim_method">',
        '              <label class="filter-label">Simulation Cutoff</label>',
        '              <input type="number" class="form-control form-control-sm" ng-model="vm.filters.sim_value" ng-model-options="{ debounce: 300 }" ng-change="vm.loadPreview()" placeholder="Value..." />',
        '            </div>',
        '          </div>',
        '        </div>',

        '        <div ng-if="!vm.filteredResults().length" class="empty-state">No projected standings match the selected filters.</div>',
        '        <div class="table-responsive mb-3" ng-if="vm.filteredResults().length">',
        '          <table class="data-table">',
        '            <thead><tr><th>Rank</th><th>Nominee</th><th>Category</th><th>Ledger Votes</th><th>Judge Score</th><th>Projected Outcome</th><th>Rule Basis</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="row in vm.filteredResults()">',
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
