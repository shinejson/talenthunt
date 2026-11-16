(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('ResultsController', ['$routeParams', 'ApiService', function ($routeParams, ApiService) {
      var vm = this;
      vm.loading = true;
      vm.error = null;
      vm.competition = null;
      vm.roundsData = [];

      function loadForSlug(slug) {
        if ($routeParams.round) {
          ApiService.get('/competitions/' + slug + '/results/' + $routeParams.round).then(function (res) {
            vm.competition = res.data.competition;
            vm.roundsData = [res.data];
            vm.loading = false;
          }, function (err) {
            vm.error = err.message;
            vm.loading = false;
          });
        } else {
          ApiService.get('/competitions/' + slug + '/results').then(function (res) {
            vm.competition = res.data.competition;
            vm.roundsData = res.data.rounds;
            vm.loading = false;
          }, function (err) {
            vm.error = err.message;
            vm.loading = false;
          });
        }
      }

      if ($routeParams.competition) {
        loadForSlug($routeParams.competition);
      } else {
        ApiService.get('/public/home').then(function (res) {
          if (res.data.active_competition) {
            loadForSlug(res.data.active_competition.slug);
          } else {
            vm.loading = false;
          }
        }, function () { vm.loading = false; });
      }
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/results.html', [
        '<div class="page-header"><div class="container"><h1>Official Results &amp; Standings</h1><p>{{ vm.competition ? vm.competition.title : "Published round outcomes and verified vote snapshots" }}</p></div></div>',
        '<div class="container mb-3">',
        '  <div ng-if="vm.loading" class="loading-box">Loading published results...</div>',
        '  <div ng-if="vm.error" class="alert alert-warning">{{ vm.error }}</div>',
        '  <div ng-if="!vm.loading && !vm.roundsData.length" class="card empty-state">No public results or leaderboards have been enabled for this competition yet.</div>',
        '  <div class="card mb-3" ng-repeat="item in vm.roundsData">',
        '    <div class="flex-between mb-2">',
        '      <div><h2 style="margin:0;">{{ item.round.name }}</h2><span class="muted" ng-if="item.snapshot">Immutable Finalized Snapshot &bull; Executed {{ item.snapshot.executed_at | date:"medium" }}</span><span class="muted" ng-if="item.live_leaderboard">Live Provisional Standings (Voting Open)</span></div>',
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
