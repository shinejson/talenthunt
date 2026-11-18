(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('ResultsController', ['$routeParams', '$location', 'ApiService', function ($routeParams, $location, ApiService) {
      var vm = this;
      vm.loading = true;
      vm.error = null;
      vm.competition = null;
      vm.competitions = [];
      vm.selectedCompetitionSlug = $routeParams.competition || '';
      vm.roundsData = [];

      vm.loadForSlug = function (slug) {
        if (!slug) {
          vm.loading = false;
          return;
        }
        vm.loading = true;
        vm.error = null;
        vm.selectedCompetitionSlug = slug;

        if ($routeParams.round) {
          ApiService.get('/competitions/' + slug + '/results/' + $routeParams.round).then(function (res) {
            vm.competition = res.data.competition;
            vm.roundsData = [res.data];
            vm.loading = false;
          }, function (err) {
            vm.error = (err && err.data && err.data.error && err.data.error.message) || err.message || 'Failed to load round results.';
            vm.loading = false;
          });
        } else {
          ApiService.get('/competitions/' + slug + '/results').then(function (res) {
            vm.competition = res.data.competition;
            vm.roundsData = res.data.rounds || [];
            vm.loading = false;
          }, function (err) {
            vm.error = (err && err.data && err.data.error && err.data.error.message) || err.message || 'Failed to load competition results.';
            vm.loading = false;
          });
        }
      };

      vm.onCompetitionChange = function () {
        if (vm.selectedCompetitionSlug) {
          $location.path('/results/' + vm.selectedCompetitionSlug).search({});
        }
      };

      vm.loadCompetitions = function () {
        ApiService.get('/competitions').then(function (res) {
          vm.competitions = res.data || [];
          if (!vm.selectedCompetitionSlug) {
            if ($routeParams.competition) {
              vm.selectedCompetitionSlug = $routeParams.competition;
            } else if (vm.competitions.length > 0) {
              vm.selectedCompetitionSlug = vm.competitions[0].slug;
            }
          }
          if (vm.selectedCompetitionSlug) {
            vm.loadForSlug(vm.selectedCompetitionSlug);
          } else {
            ApiService.get('/public/home').then(function (hRes) {
              if (hRes.data && hRes.data.active_competition) {
                vm.selectedCompetitionSlug = hRes.data.active_competition.slug;
                vm.loadForSlug(vm.selectedCompetitionSlug);
              } else {
                vm.loading = false;
              }
            }, function () {
              vm.loading = false;
            });
          }
        }, function () {
          vm.loading = false;
        });
      };

      vm.loadCompetitions();
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/results.html', [
        '<div class="page-header">',
        '  <div class="container">',
        '    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">',
        '      <div>',
        '        <h1 style="margin:0 0 6px;">Official Results &amp; Standings</h1>',
        '        <p style="margin:0;color:var(--text-secondary);font-size:1rem;">{{ vm.competition ? vm.competition.title : "Published round outcomes and verified vote snapshots" }}</p>',
        '      </div>',
        '      <!-- COMPETITION DROPDOWN SELECTOR IN HEADER -->',
        '      <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);padding:6px 14px;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.12);">',
        '        <th-icon name="trophy" size="18"></th-icon>',
        '        <div style="display:flex;flex-direction:column;gap:2px;">',
        '          <label style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin:0;">Select Competition</label>',
        '          <select class="form-control form-control-sm" style="font-weight:600;min-width:230px;" ng-model="vm.selectedCompetitionSlug" ng-change="vm.onCompetitionChange()">',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.slug }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',

        '<div class="container mb-4">',
        '  <!-- SPONSOR & GOOGLE ADS BANNER -->',
        '  <th-ad-banner slot="results_page" format="leaderboard"></th-ad-banner>',

        '  <!-- COMPETITION INFO & QUICK SWITCHER BAR -->',
        '  <div class="card mb-3" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">',
        '    <div style="display:flex;align-items:center;gap:12px;">',
        '      <div style="width:40px;height:40px;border-radius:8px;background:rgba(245,158,11,0.14);color:#f59e0b;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">',
        '        <th-icon name="award" size="22"></th-icon>',
        '      </div>',
        '      <div>',
        '        <h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:8px;">',
        '          <span>{{ vm.competition.title || "Selected Competition" }}</span>',
        '          <th-status-badge ng-if="vm.competition.status" status="vm.competition.status"></th-status-badge>',
        '        </h3>',
        '        <span class="muted" style="font-size:0.85rem;">{{ vm.competition.tagline || (vm.roundsData.length + " published round(s)") }}</span>',
        '      </div>',
        '    </div>',
        '    <div style="display:flex;align-items:center;gap:10px;">',
        '      <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);margin:0;white-space:nowrap;">Switch Competition:</label>',
        '      <select class="form-control form-control-sm" style="min-width:220px;" ng-model="vm.selectedCompetitionSlug" ng-change="vm.onCompetitionChange()">',
        '        <option ng-repeat="c in vm.competitions" value="{{ c.slug }}">{{ c.title }}</option>',
        '      </select>',
        '    </div>',
        '  </div>',

        '  <div ng-if="vm.loading" class="loading-box">Loading published results...</div>',
        '  <div ng-if="vm.error" class="alert alert-warning">{{ vm.error }}</div>',
        '  <div ng-if="!vm.loading && !vm.roundsData.length" class="card empty-state" style="text-align:center;padding:36px 20px;">',
        '    <div style="width:52px;height:52px;border-radius:50%;background:rgba(245,158,11,0.12);color:#f59e0b;display:inline-flex;align-items:center;justify-content:center;margin:0 auto 12px;">',
        '      <th-icon name="bar-chart" size="26"></th-icon>',
        '    </div>',
        '    <h3 style="margin:0 0 6px;">No Published Results Yet</h3>',
        '    <p class="muted" style="margin:0 0 16px;">No public results or leaderboards have been published for <strong>{{ vm.competition.title || "this competition" }}</strong> yet.</p>',
        '    <div>',
        '      <a ng-href="/nominees?competition={{ vm.selectedCompetitionSlug }}" class="btn btn-sm btn-primary" style="display:inline-flex;align-items:center;gap:6px;">',
        '        <th-icon name="user" size="14"></th-icon> <span>Browse Nominees</span>',
        '      </a>',
        '    </div>',
        '  </div>',

        '  <div class="card mb-3" ng-repeat="item in vm.roundsData">',
        '    <div class="flex-between mb-2">',
        '      <div>',
        '        <h2 style="margin:0;">{{ item.round.name }}</h2>',
        '        <span class="muted" ng-if="item.snapshot">Immutable Finalized Snapshot &bull; Executed {{ item.snapshot.executed_at | date:"medium" }}</span>',
        '        <span class="muted" ng-if="item.live_leaderboard">Live Provisional Standings (Voting Open)</span>',
        '      </div>',
        '      <th-status-badge status="item.round.status"></th-status-badge>',
        '    </div>',
        '    <div class="table-responsive" ng-if="item.snapshot && item.snapshot.results.length">',
        '      <table class="data-table">',
        '        <thead><tr><th>Rank</th><th>Contestant</th><th>Category</th><th>Verified Votes</th><th>Outcome</th><th>Notes</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="r in item.snapshot.results">',
        '            <td><strong>{{ r.final_rank ? ("#" + r.final_rank) : "-" }}</strong></td>',
        '            <td><a ng-href="/nominee/{{ r.nominee_slug }}"><strong>{{ r.nominee_name }}</strong></a></td>',
        '            <td>{{ r.category_name }}</td>',
        '            <td><strong>{{ r.final_votes | number }}</strong></td>',
        '            <td><th-status-badge status="r.outcome"></th-status-badge></td>',
        '            <td class="muted">{{ r.reason }}</td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '    <div class="table-responsive" ng-if="item.live_leaderboard && item.live_leaderboard.length">',
        '      <table class="data-table">',
        '        <thead><tr><th>Rank</th><th>Contestant</th><th>Category</th><th>Provisional Votes</th><th>Action</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="row in item.live_leaderboard">',
        '            <td><strong>#{{ row.rank }}</strong></td>',
        '            <td><a ng-href="/nominee/{{ row.public_slug }}"><strong>{{ row.public_name }}</strong></a></td>',
        '            <td>{{ row.category_name }}</td>',
        '            <td><span class="nominee-votes-pill">{{ row.votes | number }}</span></td>',
        '            <td><a ng-href="/vote/{{ vm.competition.slug }}/{{ row.voting_slug }}" class="btn btn-sm btn-primary">Vote</a></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
