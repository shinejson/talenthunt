(function () {
  'use strict';

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
        '          <div class="nominee-avatar" style="width:68px;height:68px;font-size:1.4rem;">{{ vm.nominee.public_name | initials }}</div>',
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

        '    <div class="grid-2 mt-3">',
        '      <div class="card">',
        '        <h3>Approved Audition Demo</h3>',
        '        <div ng-if="vm.nominee.demo && !vm.nominee.demo.is_hidden">',
        '          <h4 style="margin:0 0 8px;">{{ vm.nominee.demo.title }}</h4>',
        '          <p class="muted">{{ vm.nominee.demo.description }}</p>',
        '          <div ng-if="vm.nominee.demo.media_asset && vm.nominee.demo.media_asset.url" class="mt-2">',
        '            <video ng-if="vm.nominee.demo.media_asset.mime_type.indexOf(\'video\') === 0" controls style="width:100%;border-radius:8px;" ng-src="{{ vm.nominee.demo.media_asset.url }}"></video>',
        '            <audio ng-if="vm.nominee.demo.media_asset.mime_type.indexOf(\'audio\') === 0" controls style="width:100%;" ng-src="{{ vm.nominee.demo.media_asset.url }}"></audio>',
        '            <img ng-if="vm.nominee.demo.media_asset.mime_type.indexOf(\'image\') === 0" style="max-width:100%;border-radius:8px;" ng-src="{{ vm.nominee.demo.media_asset.url }}" alt="Demo preview" />',
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
        '            <span>{{ h.round_name }}</span>',
        '            <span><th-status-badge status="h.outcome"></th-status-badge> <strong ng-if="h.final_votes !== null">({{ h.final_votes }} votes)</strong></span>',
        '          </div>',
        '        </div>',
        '        <div class="mt-3" style="border-top:1px solid var(--border);padding-top:12px;">',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.showReportForm = !vm.showReportForm">Report Content Concern</button>',
        '          <form ng-if="vm.showReportForm" class="mt-2" ng-submit="vm.submitReport()">',
        '            <div class="form-group"><label class="form-label">Reason</label><select class="form-control" ng-model="vm.report.reason"><option value="">Select reason...</option><option value="Copyright / Rights Infringement">Copyright / Rights Infringement</option><option value="Inappropriate Content">Inappropriate Content</option><option value="Impersonation">Impersonation</option></select></div>',
        '            <div class="form-group"><label class="form-label">Details</label><textarea class="form-control" ng-model="vm.report.details"></textarea></div>',
        '            <button type="submit" class="btn btn-sm btn-danger">Submit Report</button>',
        '          </form>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
