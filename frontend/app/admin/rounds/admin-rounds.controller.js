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
        vm.newRoundDates = { openAt: null, closeAt: null };
        vm.newPkg = { name: '', vote_quantity: 25, price_minor: 2500, is_featured: false };

        // Voting Deadline Modal State
        vm.deadlineModal = {
          round: null,
          openAt: null,
          closeAt: null,
          status: 'OPEN'
        };

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
            voting_opens_at: vm.newRoundDates.openAt ? vm.newRoundDates.openAt.toISOString() : null,
            voting_closes_at: vm.newRoundDates.closeAt ? vm.newRoundDates.closeAt.toISOString() : null,
            elimination_config: {
              method: vm.newRound.method,
              advance_count: parseInt(vm.newRound.advance_count || 3, 10),
              tie_breakers: ['judge_score_desc', 'earliest_qualifying_vote_timestamp'],
              exclude_disqualified: true,
              pending_payment_grace_minutes: 30
            }
          }).then(function () {
            vm.newRound.name = '';
            vm.newRoundDates = { openAt: null, closeAt: null };
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

        // --- VOTING DEADLINES & WINDOW CONTROLS ---
        vm.openDeadlineModal = function (r) {
          vm.deadlineModal.round = r;
          vm.deadlineModal.openAt = r.voting_opens_at ? new Date(r.voting_opens_at) : null;
          vm.deadlineModal.closeAt = r.voting_closes_at ? new Date(r.voting_closes_at) : null;
          vm.deadlineModal.status = r.status;
        };

        vm.closeDeadlineModal = function () {
          vm.deadlineModal.round = null;
          vm.deadlineModal.openAt = null;
          vm.deadlineModal.closeAt = null;
        };

        vm.applyRoundPreset = function (hours) {
          var now = new Date();
          vm.deadlineModal.openAt = now;
          if (hours === 0) {
            vm.deadlineModal.closeAt = now;
            vm.deadlineModal.status = 'CLOSED';
          } else if (hours === -1) {
            vm.deadlineModal.closeAt = null;
            vm.deadlineModal.status = 'OPEN';
          } else {
            var close = new Date(now.getTime() + hours * 60 * 60 * 1000);
            vm.deadlineModal.closeAt = close;
            vm.deadlineModal.status = 'OPEN';
          }
        };

        vm.saveRoundDeadlines = function () {
          var r = vm.deadlineModal.round;
          if (!r) return;
          var payload = {
            action: 'set_deadlines',
            voting_opens_at: vm.deadlineModal.openAt ? vm.deadlineModal.openAt.toISOString() : null,
            voting_closes_at: vm.deadlineModal.closeAt ? vm.deadlineModal.closeAt.toISOString() : null,
            status: vm.deadlineModal.status
          };
          ApiService.post('/admin/rounds/' + r.id + '/voting-window', payload).then(function () {
            ToastService.success('Voting window and deadlines updated for ' + r.name);
            vm.closeDeadlineModal();
            vm.loadRounds();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.openVotingNow = function (r) {
          ApiService.post('/admin/rounds/' + r.id + '/voting-window', { action: 'open' }).then(function () {
            ToastService.success('Voting is now OPEN for ' + r.name);
            vm.loadRounds();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.closeVotingNow = function (r) {
          ApiService.post('/admin/rounds/' + r.id + '/voting-window', { action: 'close' }).then(function () {
            ToastService.success('Voting is now CLOSED / frozen for ' + r.name);
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

        '        <!-- Voting Deadline Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.deadlineModal.round" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">',
        '      <div class="card" style="max-width:520px;width:100%;margin:0;position:relative;box-shadow:0 20px 40px rgba(0,0,0,0.4);border:1px solid var(--border-strong);background:var(--bg-surface);">',
        '        <div class="flex-between mb-2">',
        '          <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '            <th-icon name="calendar" size="18" style="color:var(--accent);"></th-icon>',
        '            <span>Voting Deadlines: {{ vm.deadlineModal.round.name }}</span>',
        '          </h3>',
        '          <button type="button" class="btn-close" ng-click="vm.closeDeadlineModal()" aria-label="Close">&times;</button>',
        '        </div>',
        '        <p class="muted" style="font-size:0.85rem;margin-bottom:14px;">',
        '          Set opening schedules and closing deadlines for this voting round. Orders submitted after the deadline will be automatically rejected.',
        '        </p>',
        '        <div class="mb-3">',
        '          <label class="filter-label mb-1">Quick Presets</label>',
        '          <div class="inline-actions" style="gap:6px;flex-wrap:wrap;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyRoundPreset(-1)">Open Now (No Limit)</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyRoundPreset(24)">24 Hours</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyRoundPreset(48)">48 Hours</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyRoundPreset(168)">7 Days</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyRoundPreset(0)">Close Now</button>',
        '          </div>',
        '        </div>',
        '        <form ng-submit="vm.saveRoundDeadlines()">',
        '          <div class="form-group mb-2">',
        '            <label class="filter-label">Voting Opens At</label>',
        '            <input type="datetime-local" class="form-control form-control-sm" ng-model="vm.deadlineModal.openAt" />',
        '            <small class="muted" style="font-size:0.75rem;">Leave empty to start immediately when round is open.</small>',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="filter-label">Voting Deadline (Closes At)</label>',
        '            <input type="datetime-local" class="form-control form-control-sm" ng-model="vm.deadlineModal.closeAt" />',
        '            <small class="muted" style="font-size:0.75rem;">When reached, public voting and checkout will be blocked.</small>',
        '          </div>',
        '          <div class="form-group mb-3">',
        '            <label class="filter-label">Round Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.deadlineModal.status">',
        '              <option value="OPEN">OPEN (Voting live)</option>',
        '              <option value="SCHEDULED">SCHEDULED (Opens automatically when start date arrives)</option>',
        '              <option value="CLOSED">CLOSED (Voting frozen/closed)</option>',
        '              <option value="RECONCILIATION">RECONCILIATION</option>',
        '              <option value="RESULTS_PENDING">RESULTS_PENDING</option>',
        '              <option value="FINALIZED">FINALIZED</option>',
        '              <option value="DRAFT">DRAFT</option>',
        '            </select>',
        '          </div>',
        '          <div class="inline-actions" style="justify-content:flex-end;gap:8px;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.closeDeadlineModal()">Cancel</button>',
        '            <button type="submit" class="btn btn-sm btn-primary">',
        '              <th-icon name="check" size="14"></th-icon><span>Save Deadlines</span>',
        '            </button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '    </div>',
        '',
        '      <h3>Create New Round</h3>',
        '      <form class="mb-3" ng-submit="vm.createRound()" style="background:var(--bg-subtle, rgba(255,255,255,0.02));padding:14px;border-radius:6px;border:1px solid var(--border-color);">',
        '        <div class="grid-3 mb-2">',
        '          <div><label class="filter-label">Round Name *</label><input type="text" class="form-control" ng-model="vm.newRound.name" placeholder="Round Name *" required /></div>',
        '          <div><label class="filter-label">Elimination Method</label><select class="form-control" ng-model="vm.newRound.method"><option value="top_n">Top N</option><option value="percentage">Percentage</option><option value="threshold">Vote Threshold</option><option value="hybrid">Hybrid (Votes + Judge)</option><option value="manual">Manual Panel</option></select></div>',
        '          <div><label class="filter-label">Advance Count (N)</label><input type="number" class="form-control" ng-model="vm.newRound.advance_count" placeholder="Advance N" /></div>',
        '        </div>',
        '        <div class="grid-2 mb-2">',
        '          <div><label class="filter-label">Voting Opens At (Optional)</label><input type="datetime-local" class="form-control" ng-model="vm.newRoundDates.openAt" /></div>',
        '          <div><label class="filter-label">Voting Deadline / Closes At (Optional)</label><input type="datetime-local" class="form-control" ng-model="vm.newRoundDates.closeAt" /></div>',
        '        </div>',
        '        <div class="flex-between">',
        '          <label><input type="checkbox" ng-model="vm.newRound.is_finale" /> Mark as Finale Round</label>',
        '          <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Create Round</span></button>',
        '        </div>',
        '      </form>',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable dt-data="vm.rounds" dt-row="r" dt-empty="No rounds match the selected filters.">',
        '          <thead><tr><th dt-sort="r.sequence_no">#</th><th dt-sort="r.name">Round</th><th dt-sort="r.elimination_config.method">Method</th><th dt-sort="r.status">Status</th><th>Voting Window &amp; Deadlines</th><th>Quick Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>{{ r.sequence_no }}</td>',
        '              <td><strong>{{ r.name }}</strong><span ng-if="r.is_finale" class="status-badge badge-info" style="margin-left:6px;">Finale</span></td>',
        '              <td><code>{{ r.elimination_config.method }}</code> (N={{ r.elimination_config.advance_count || "-" }})</td>',
        '              <td><th-status-badge status="r.status"></th-status-badge></td>',
        '              <td>',
        '                <div style="font-size:0.8rem;line-height:1.4;">',
        '                  <div><span class="muted">Opens:</span> <strong ng-if="r.voting_opens_at">{{ r.voting_opens_at | date:\'medium\' }}</strong><em ng-if="!r.voting_opens_at">Immediate</em></div>',
        '                  <div><span class="muted">Deadline:</span> <strong ng-if="r.voting_closes_at" style="color:var(--accent);">{{ r.voting_closes_at | date:\'medium\' }}</strong><em ng-if="!r.voting_closes_at">No deadline</em></div>',
        '                </div>',
        '              </td>',
        '              <td class="inline-actions" style="gap:6px;">',
        '                <button ng-if="r.status !== \'OPEN\' && r.status !== \'FINALIZED\'" type="button" class="btn btn-sm btn-success" ng-click="vm.openVotingNow(r)" title="Open voting immediately"><th-icon name="play" size="13"></th-icon><span>Open</span></button>',
        '                <button ng-if="r.status === \'OPEN\'" type="button" class="btn btn-sm btn-secondary" ng-click="vm.closeVotingNow(r)" title="Close/freeze voting immediately"><th-icon name="pause" size="13"></th-icon><span>Close</span></button>',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openDeadlineModal(r)" title="Set voting schedule and deadlines"><th-icon name="calendar" size="13"></th-icon><span>Deadlines</span></button>',
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
