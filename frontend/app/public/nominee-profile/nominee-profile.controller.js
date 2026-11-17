(function () {
  'use strict';

  var NOMINEE_VISUALS = {
    'ama-gold': '/assets/images/talent-ama.jpg',
    'kwesi-motion': '/assets/images/talent-kwesi.jpg',
    'poetess-esi': '/assets/images/talent-esi.jpg',
    'king-zongo-bars': '/assets/images/talent-ibrahim.jpg',
    'kojo-laughs': '/assets/images/talent-kojo.jpg'
  };
  var DEFAULT_IMAGES = [
    '/assets/images/talent-ama.jpg',
    '/assets/images/talent-kwesi.jpg',
    '/assets/images/talent-esi.jpg',
    '/assets/images/talent-ibrahim.jpg',
    '/assets/images/talent-kojo.jpg'
  ];

  function resolveImage(slug) {
    var s = (slug || '').toLowerCase();
    for (var k in NOMINEE_VISUALS) {
      if (s.indexOf(k) !== -1) return NOMINEE_VISUALS[k];
    }
    return DEFAULT_IMAGES[0];
  }

  angular.module('talentHuntApp')
    .controller('NomineeProfileController', ['$routeParams', '$window', 'ApiService', 'ToastService',
      function ($routeParams, $window, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.nominee = null;
        vm.error = null;
        vm.showReportForm = false;
        vm.report = { reason: '', details: '' };

        ApiService.get('/nominees/' + $routeParams.slug).then(function (res) {
          vm.nominee = res.data;
          if (vm.nominee) {
            vm.nominee.image = resolveImage(vm.nominee.public_slug);
          }
          vm.shareUrl = $window.location.origin + (vm.nominee.voting_path || ('/nominee/' + vm.nominee.public_slug));
          vm.loading = false;
        }, function (err) {
          vm.error = err.message;
          vm.loading = false;
        });

        vm.copyLink = function () {
          if ($window.navigator && $window.navigator.clipboard) {
            $window.navigator.clipboard.writeText(vm.shareUrl);
            ToastService.success('Voting link copied to clipboard!');
          }
        };

        vm.submitReport = function () {
          if (!vm.report.reason) {
            ToastService.error('Please select or enter a report reason.');
            return;
          }
          ApiService.post('/public/report', {
            entity_type: 'NOMINEE',
            entity_id: vm.nominee.id,
            reason: vm.report.reason,
            details: vm.report.details
          }).then(function () {
            ToastService.success('Report submitted to our moderation team.');
            vm.showReportForm = false;
            vm.report = { reason: '', details: '' };
          }, function (err) {
            ToastService.error(err.message);
          });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/nominee-profile.html', [
        '<div class="container mt-3 mb-3">',
        '  <div ng-if="vm.loading" class="loading-box">Loading nominee profile...</div>',
        '  <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '  <div ng-if="vm.nominee">',
        '    <div class="card">',
        '      <div class="flex-between">',
        '        <div class="nominee-card-top" style="margin-bottom:0;">',
        '          <img ng-src="{{ vm.nominee.image }}" alt="{{ vm.nominee.public_name }}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--accent-gold);box-shadow:0 4px 10px rgba(0,0,0,0.15);" />',
        '          <div>',
        '            <th-status-badge status="vm.nominee.status"></th-status-badge>',
        '            <h1 style="margin:6px 0 2px;font-size:1.8rem;">{{ vm.nominee.public_name }}</h1>',
        '            <div class="muted">{{ vm.nominee.category_name }} &bull; {{ vm.nominee.competition_title }} &bull; {{ vm.nominee.location || "Ghana" }}</div>',
        '          </div>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <span class="nominee-votes-pill" ng-if="vm.nominee.public_votes !== undefined && vm.nominee.public_votes !== null">&#9733; {{ vm.nominee.public_votes | number }} Verified Votes</span>',
        '          <a ng-if="vm.nominee.status === \'ACTIVE\' || vm.nominee.status === \'QUALIFIED\'" ng-href="{{ vm.nominee.voting_path }}" class="btn btn-lg btn-primary">Vote for {{ vm.nominee.public_name }}</a>',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.copyLink()">Copy Voting Link</button>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <!-- SPONSOR & GOOGLE ADS BANNER -->',
        '    <th-ad-banner slot="nominee_profile" format="leaderboard"></th-ad-banner>',

        '    <div class="grid-2 mt-3">',
        '      <div class="card">',
        '        <h3>Approved Audition Demo &amp; Performance</h3>',
        '        <div ng-if="vm.nominee.demo && !vm.nominee.demo.is_hidden">',
        '          <h4 style="margin:0 0 8px;">{{ vm.nominee.demo.title }}</h4>',
        '          <p class="muted">{{ vm.nominee.demo.description }}</p>',
        '          <div class="mt-2">',
        '            <video ng-if="vm.nominee.demo.media_asset && vm.nominee.demo.media_asset.url && vm.nominee.demo.media_asset.mime_type.indexOf(\'video\') === 0" controls playsinline style="width:100%;border-radius:8px;max-height:360px;background:#000;" ng-src="{{ vm.nominee.demo.media_asset.url }}"></video>',
        '            <audio ng-if="vm.nominee.demo.media_asset && vm.nominee.demo.media_asset.url && vm.nominee.demo.media_asset.mime_type.indexOf(\'audio\') === 0" controls style="width:100%;" ng-src="{{ vm.nominee.demo.media_asset.url }}"></audio>',
        '            <video ng-if="!vm.nominee.demo.media_asset" controls playsinline style="width:100%;border-radius:8px;max-height:360px;background:#000;" src="/assets/videos/demo-sample.mp4"></video>',
        '          </div>',
        '          <div ng-if="vm.nominee.demo.external_video_url" class="mt-2">',
        '            <a ng-href="{{ vm.nominee.demo.external_video_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">&#9654; Watch External Hosted Performance</a>',
        '          </div>',
        '        </div>',
        '        <div ng-if="!vm.nominee.demo || vm.nominee.demo.is_hidden" class="muted">Demo media is currently unavailable.</div>',
        '      </div>',

        '      <div class="card">',
        '        <h3>About {{ vm.nominee.public_name }}</h3>',
        '        <p style="white-space:pre-wrap;">{{ vm.nominee.profile_text || "Official StageLight contestant." }}</p>',
        '        <div ng-if="vm.nominee.current_round_entry" class="alert alert-info">',
        '          <strong>Current Round:</strong> {{ vm.nominee.current_round_entry.round_name }} ({{ vm.nominee.current_round_entry.status }})',
        '        </div>',
        '        <div ng-if="vm.nominee.published_round_history && vm.nominee.published_round_history.length" class="mt-2">',
        '          <h4>Published Round History</h4>',
        '          <div ng-repeat="h in vm.nominee.published_round_history" class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border);">',
        '            <div><strong>{{ h.round_name }}</strong> &bull; <span class="muted">{{ h.status }}</span></div>',
        '            <div><span class="nominee-votes-pill">{{ h.final_votes | number }} votes</span></div>',
        '          </div>',
        '        </div>',
        '        <div class="mt-3">',
        '          <th-ad-banner slot="sidebar" format="sidebar"></th-ad-banner>',
        '        </div>',
        '        <div class="mt-3">',
        '          <button type="button" class="btn btn-sm btn-outline-danger" ng-if="!vm.showReportForm" ng-click="vm.showReportForm = true">Report Profile</button>',
        '          <form ng-if="vm.showReportForm" ng-submit="vm.submitReport()" class="card mt-2" style="background:var(--bg-subtle);">',
        '            <h4>Report Nominee Profile</h4>',
        '            <div class="mb-2">',
        '              <label class="form-label">Reason</label>',
        '              <select class="form-control" ng-model="vm.report.reason" required>',
        '                <option value="">Select reason...</option>',
        '                <option value="COPYRIGHT">Copyright or original demo violation</option>',
        '                <option value="FRAUD">Impersonation or fraudulent identity</option>',
        '                <option value="INAPPROPRIATE">Inappropriate or prohibited content</option>',
        '                <option value="OTHER">Other concern</option>',
        '              </select>',
        '            </div>',
        '            <div class="mb-2">',
        '              <label class="form-label">Details</label>',
        '              <textarea class="form-control" rows="3" ng-model="vm.report.details" placeholder="Describe the issue..."></textarea>',
        '            </div>',
        '            <div class="inline-actions">',
        '              <button type="submit" class="btn btn-sm btn-danger">Submit Report</button>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.showReportForm = false">Cancel</button>',
        '            </div>',
        '          </form>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
