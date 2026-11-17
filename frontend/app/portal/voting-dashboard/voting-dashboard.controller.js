(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('NomineeVotingDashboardController', ['$window', '$timeout', '$scope', 'ApiService', 'ToastService',
      function ($window, $timeout, $scope, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.dash = null;
        vm.error = null;
        var chartInstance = null;

        function renderChart() {
          if (!vm.dash || !vm.dash.vote_trend || !$window.Chart) return;
          var canvas = document.getElementById('nomineeVoteTrendCanvas');
          if (!canvas) return;
          if (chartInstance) {
            chartInstance.destroy();
          }
          var labels = vm.dash.vote_trend.map(function (pt) { return pt.date; });
          var values = vm.dash.vote_trend.map(function (pt) { return pt.votes; });
          if (!labels.length) {
            labels = ['Today'];
            values = [0];
          }
          chartInstance = new $window.Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [{
                label: 'Verified Votes',
                data: values,
                backgroundColor: '#d97706',
                borderRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
          });
        }

        function handleResize() {
          if (chartInstance) {
            chartInstance.resize();
          }
        }
        angular.element($window).on('resize', handleResize);

        $scope.$on('$destroy', function () {
          angular.element($window).off('resize', handleResize);
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
        });

        vm.load = function () {
          vm.loading = true;
          ApiService.get('/nominee/dashboard').then(function (res) {
            vm.dash = res.data;
            vm.loading = false;
            $timeout(renderChart, 80);
          }, function (err) {
            vm.error = err.message;
            vm.loading = false;
          });
        };

        vm.copyVotingLink = function () {
          if (vm.dash && vm.dash.voting_url && $window.navigator && $window.navigator.clipboard) {
            $window.navigator.clipboard.writeText(vm.dash.voting_url);
            ToastService.success('Unique voting link copied to clipboard!');
          }
        };

        $scope.$on('$destroy', function () {
          if (chartInstance) chartInstance.destroy();
        });

        vm.load();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/voting-dashboard.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <div ng-if="vm.loading" class="loading-box">Loading ledger-backed nominee analytics...</div>',
        '    <div ng-if="vm.error" class="alert alert-warning">{{ vm.error }}</div>',
        '    <div ng-if="vm.dash">',
        '      <div class="card mb-3">',
        '        <div class="flex-between">',
        '          <div>',
        '            <th-status-badge status="vm.dash.nominee.status"></th-status-badge>',
        '            <h1 style="margin:6px 0 2px;font-size:1.6rem;">{{ vm.dash.nominee.public_name }} &mdash; Campaign Dashboard</h1>',
        '            <div class="muted">{{ vm.dash.competition.title }} &bull; {{ vm.dash.nominee.category_name }}</div>',
        '          </div>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load()">&#8635; Refresh Stats</button>',
        '        </div>',
        '      </div>',

        '      <div class="grid-4 mb-3">',
        '        <div class="kpi-card">',
        '          <div class="kpi-label">Current Round Votes</div>',
        '          <div class="kpi-value">{{ vm.dash.current_round_votes | number }}</div>',
        '          <div class="kpi-sub"><span ng-if="vm.dash.is_provisional" class="status-badge badge-warning">Provisional (Pending Reconciliation)</span><span ng-if="!vm.dash.is_provisional">Verified Ledger Total</span></div>',
        '        </div>',
        '        <div class="kpi-card">',
        '          <div class="kpi-label">Competition Total</div>',
        '          <div class="kpi-value">{{ vm.dash.lifetime_votes | number }}</div>',
        '          <div class="kpi-sub">Across all rounds</div>',
        '        </div>',
        '        <div class="kpi-card">',
        '          <div class="kpi-label">Round Standing</div>',
        '          <div class="kpi-value" ng-if="vm.dash.rank_info">#{{ vm.dash.rank_info.rank }} <span style="font-size:0.95rem;font-weight:500;">/ {{ vm.dash.rank_info.total_contestants }}</span></div>',
        '          <div class="kpi-value" ng-if="!vm.dash.rank_info" style="font-size:1.1rem;">Hidden by Rules</div>',
        '          <div class="kpi-sub">Rank may change while open</div>',
        '        </div>',
        '        <div class="kpi-card">',
        '          <div class="kpi-label">Active Round Window</div>',
        '          <div class="kpi-value" style="font-size:1.05rem;">{{ vm.dash.current_round ? vm.dash.current_round.name : "N/A" }}</div>',
        '          <div class="kpi-sub" ng-if="vm.dash.current_round && vm.dash.current_round.voting_closes_at">Closes {{ vm.dash.current_round.voting_closes_at | date:"mediumDate" }}</div>',
        '        </div>',
        '      </div>',

        '      <div class="share-panel mb-3">',
        '        <div>',
        '          <span class="eyebrow" style="margin-bottom:8px;">Share Your Round-Specific Voting Link</span>',
        '          <h3 style="margin:0 0 6px;color:#fff;">Promote Your Profile &amp; Collect Verified Votes</h3>',
        '          <p style="margin:0;color:#cbd5e1;font-size:0.9rem;">Every supporter payment on this link is verified and credited directly to your current round ledger.</p>',
        '          <div class="share-url-box">',
        '            <input type="text" class="share-url-input" readonly ng-value="vm.dash.voting_url" />',
        '            <button type="button" class="btn btn-gold" ng-click="vm.copyVotingLink()">Copy Link</button>',
        '            <a ng-href="{{ vm.dash.voting_path }}" class="btn btn-outline-light">Preview Page</a>',
        '          </div>',
        '        </div>',
        '        <div class="qr-frame" ng-if="vm.dash.qr_data_uri">',
        '          <img ng-src="{{ vm.dash.qr_data_uri }}" alt="Nominee Voting QR Code" />',
        '          <a href="/api/v1/nominee/voting-link/qr.png" download class="btn btn-sm btn-secondary mt-1" style="width:100%;">Download QR</a>',
        '        </div>',
        '      </div>',

        '      <div class="grid-2 mb-3">',
        '        <div class="card">',
        '          <h3 style="margin-top:0;">Daily Verified Vote Trend</h3>',
        '          <div style="height:220px;"><canvas id="nomineeVoteTrendCanvas"></canvas></div>',
        '        </div>',
        '        <div class="card">',
        '          <h3 style="margin-top:0;">Round Progression History</h3>',
        '          <div ng-repeat="rh in vm.dash.round_history" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '            <div class="flex-between"><strong>{{ rh.round_name }}</strong><th-status-badge status="rh.status"></th-status-badge></div>',
        '            <div class="muted" style="font-size:0.84rem;">Verified Votes: <strong>{{ rh.votes | number }}</strong> &bull; Round State: {{ rh.round_status }}</div>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div class="card">',
        '        <h3 style="margin-top:0;">Recent Aggregate Voting Activity</h3>',
        '        <p class="muted" style="font-size:0.84rem;">Voter personal contact details and payment credentials are never exposed to nominees.</p>',
        '        <div ng-if="!vm.dash.recent_activity.length" class="muted">No voting activity recorded in this round yet.</div>',
        '        <div class="table-responsive" ng-if="vm.dash.recent_activity.length">',
        '          <table class="data-table" th-datatable dt-data="vm.dash.recent_activity" dt-row="act" dt-page-length="10">',
        '            <thead><tr><th dt-sort="act.created_at">Timestamp (UTC)</th><th dt-sort="act.entry_type">Entry Type</th><th dt-sort="act.channel">Channel</th><th dt-sort="act.votes">Votes</th></tr></thead>',
        '            <tbody>',
        '              <tr>',
        '                <td>{{ act.created_at | date:"medium" }}</td>',
        '                <td><th-status-badge status="act.entry_type"></th-status-badge></td>',
        '                <td>{{ act.channel }}</td>',
        '                <td><strong>{{ act.votes > 0 ? ("+" + act.votes) : act.votes }}</strong></td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
