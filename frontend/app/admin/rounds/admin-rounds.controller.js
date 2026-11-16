(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminRoundsController', ['ApiService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.competitions = [];
        vm.selectedCompId = '';
        vm.rounds = [];
        vm.packages = [];
        vm.roundFilters = { q: '', status: '', method: '', is_finale: '' };
        vm.pkgFilters = { q: '', is_featured: '' };
        vm.newRound = { name: '', status: 'SCHEDULED', method: 'top_n', advance_count: 3, is_finale: false };
        vm.newPkg = { name: '', vote_quantity: 25, price_minor: 2500, is_featured: false };

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
          if (vm.competitions.length) {
            vm.selectedCompId = vm.competitions[0].id;
          }
          vm.loadAll();
        });

        vm.loadRounds = function () {
          var params = AdminFilterUtils.cleanParams(angular.extend({ competition_id: vm.selectedCompId }, vm.roundFilters));
          ApiService.get('/admin/rounds', params).then(function (res) { vm.rounds = res.data || []; });
        };

        vm.loadPackages = function () {
          var params = AdminFilterUtils.cleanParams(angular.extend({ competition_id: vm.selectedCompId }, vm.pkgFilters));
          ApiService.get('/admin/packages', params).then(function (res) { vm.packages = res.data || []; });
        };

        vm.loadAll = function () {
          vm.loadRounds();
          vm.loadPackages();
        };

        vm.activeRoundFilterCount = function () {
          return AdminFilterUtils.countActive(vm.roundFilters);
        };

        vm.resetRoundFilters = function () {
          vm.roundFilters = { q: '', status: '', method: '', is_finale: '' };
          vm.loadRounds();
        };

        vm.activePkgFilterCount = function () {
          return AdminFilterUtils.countActive(vm.pkgFilters);
        };

        vm.resetPkgFilters = function () {
          vm.pkgFilters = { q: '', is_featured: '' };
          vm.loadPackages();
        };

        vm.createRound = function () {
          var targetCompId = vm.selectedCompId || (vm.competitions[0] && vm.competitions[0].id);
          if (!targetCompId) {
            ToastService.error('Select a competition first.');
            return;
          }
          ApiService.post('/admin/rounds', {
            competition_id: targetCompId,
            name: vm.newRound.name,
            status: vm.newRound.status,
            is_finale: vm.newRound.is_finale,
            elimination_config: {
              method: vm.newRound.method,
              advance_count: parseInt(vm.newRound.advance_count || 3, 10),
              tie_breakers: ['judge_score_desc', 'earliest_qualifying_vote_timestamp'],
              exclude_disqualified: true,
              pending_payment_grace_minutes: 30
            }
          }).then(function () {
            vm.newRound.name = '';
            ToastService.success('Round created.');
            vm.loadRounds();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.updateRoundStatus = function (r, st) {
          ApiService.patch('/admin/rounds/' + r.id, { status: st }).then(function () {
            ToastService.success('Round status updated to ' + st);
            vm.loadRounds();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.createPackage = function () {
          var targetCompId = vm.selectedCompId || (vm.competitions[0] && vm.competitions[0].id);
          if (!targetCompId) {
            ToastService.error('Select a competition first.');
            return;
          }
          ApiService.post('/admin/packages', {
            competition_id: targetCompId,
            name: vm.newPkg.name,
            vote_quantity: parseInt(vm.newPkg.vote_quantity, 10),
            price_minor: parseInt(vm.newPkg.price_minor, 10),
            is_featured: vm.newPkg.is_featured
          }).then(function () {
            vm.newPkg.name = '';
            ToastService.success('Vote package created.');
            vm.loadPackages();
          }, function (err) { ToastService.error(err.message); });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/rounds.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Rounds &amp; Vote Packages</h1>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Rounds</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.rounds.length }} round(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeRoundFilterCount() > 0" ng-click="vm.resetRoundFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field">',
        '            <label class="filter-label">Competition</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.selectedCompId" ng-change="vm.loadAll()">',
        '              <option value="">All Competitions</option>',
        '              <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Round</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.roundFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadRounds()" placeholder="Search round name..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.roundFilters.status" ng-change="vm.loadRounds()">',
        '              <option value="">All Statuses</option>',
        '              <option value="DRAFT">DRAFT</option>',
        '              <option value="SCHEDULED">SCHEDULED</option>',
        '              <option value="OPEN">OPEN</option>',
        '              <option value="CLOSED">CLOSED</option>',
        '              <option value="RECONCILIATION">RECONCILIATION</option>',
        '              <option value="RESULTS_PENDING">RESULTS_PENDING</option>',
        '              <option value="FINALIZED">FINALIZED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Method</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.roundFilters.method" ng-change="vm.loadRounds()">',
        '              <option value="">All Methods</option>',
        '              <option value="top_n">Top N</option>',
        '              <option value="percentage">Percentage</option>',
        '              <option value="threshold">Vote Threshold</option>',
        '              <option value="hybrid">Hybrid</option>',
        '              <option value="manual">Manual Panel</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Round Stage</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.roundFilters.is_finale" ng-change="vm.loadRounds()">',
        '              <option value="">All Stages</option>',
        '              <option value="true">Finale Only</option>',
        '              <option value="false">Regular Rounds</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <h3>Create New Round</h3>',
        '      <form class="grid-4 mb-3" ng-submit="vm.createRound()">',
        '        <input type="text" class="form-control" ng-model="vm.newRound.name" placeholder="Round Name *" required />',
        '        <select class="form-control" ng-model="vm.newRound.method"><option value="top_n">Top N</option><option value="percentage">Percentage</option><option value="threshold">Vote Threshold</option><option value="hybrid">Hybrid (Votes + Judge)</option><option value="manual">Manual Panel</option></select>',
        '        <input type="number" class="form-control" ng-model="vm.newRound.advance_count" placeholder="Advance N" />',
        '        <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Create Round</span></button>',
        '      </form>',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable dt-data="vm.rounds" dt-row="r" dt-empty="No rounds match the selected filters.">',
        '          <thead><tr><th dt-sort="r.sequence_no">#</th><th dt-sort="r.name">Round</th><th dt-sort="r.elimination_config.method">Elimination Method</th><th dt-sort="r.status">Status</th><th>Quick State Controls</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>{{ r.sequence_no }}</td>',
        '              <td><strong>{{ r.name }}</strong><span ng-if="r.is_finale" class="status-badge badge-info" style="margin-left:6px;">Finale</span></td>',
        '              <td><code>{{ r.elimination_config.method }}</code> (N={{ r.elimination_config.advance_count || "-" }})</td>',
        '              <td><th-status-badge status="r.status"></th-status-badge></td>',
        '              <td class="inline-actions">',
        '                <button ng-if="r.status !== \'OPEN\' && r.status !== \'FINALIZED\'" type="button" class="btn btn-sm btn-success" ng-click="vm.updateRoundStatus(r, \'OPEN\')">Open Voting</button>',
        '                <button ng-if="r.status === \'OPEN\'" type="button" class="btn btn-sm btn-secondary" ng-click="vm.updateRoundStatus(r, \'CLOSED\')">Freeze / Close</button>',
        '                <a ng-href="/admin/eliminations?round={{ r.id }}" class="btn btn-sm btn-primary">Elimination</a>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',

        '    <div class="card">',
        '      <h3 style="margin-top:0;">Vote Packages (Minor Units: 100 pesewas = GHS 1.00)</h3>',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Vote Packages</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.packages.length }} package(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activePkgFilterCount() > 0" ng-click="vm.resetPkgFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Package</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.pkgFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadPackages()" placeholder="Search package name..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Featured</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.pkgFilters.is_featured" ng-change="vm.loadPackages()">',
        '              <option value="">All Packages</option>',
        '              <option value="true">Featured Only</option>',
        '              <option value="false">Standard Only</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <form class="grid-4 mb-2" ng-submit="vm.createPackage()">',
        '        <input type="text" class="form-control" ng-model="vm.newPkg.name" placeholder="Package Name *" required />',
        '        <input type="number" class="form-control" ng-model="vm.newPkg.vote_quantity" placeholder="Vote Quantity" required />',
        '        <input type="number" class="form-control" ng-model="vm.newPkg.price_minor" placeholder="Price in pesewas" required />',
        '        <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Add Package</span></button>',
        '      </form>',
        '      <div class="table-responsive">',
        '      <table class="data-table" th-datatable dt-data="vm.packages" dt-row="p" dt-empty="No vote packages match the selected filters.">',
        '        <thead><tr><th dt-sort="p.name">Package</th><th dt-sort="p.vote_quantity">Votes</th><th dt-sort="p.price_minor">Price</th><th dt-sort="p.is_featured">Featured</th></tr></thead>',
        '        <tbody><tr><td><strong>{{ p.name }}</strong></td><td>{{ p.vote_quantity }}</td><td>{{ p.price_major | ghsCurrency:p.currency }}</td><td>{{ p.is_featured ? "Yes" : "No" }}</td></tr></tbody>',
        '      </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
