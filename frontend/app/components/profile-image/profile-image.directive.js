(function () {
  'use strict';

  angular.module('talentHuntApp')
    .directive('thProfileImageField', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      return {
        restrict: 'E',
        scope: {
          asset: '='
        },
        template: [
          '<div class="card" style="background: var(--bg-subtle); padding: 14px;">',
          '  <label class="form-label">Professional Profile Image (JPG, PNG, GIF &mdash; max 5 MB)</label>',
          '  <input type="file" class="form-control" accept=".jpg,.jpeg,.png,.gif" />',
          '  <div class="mt-1" ng-if="uploading"><span class="muted">Uploading profile image...</span></div>',
          '  <div class="mt-2" ng-if="asset">',
          '    <img ng-src="{{ asset.url }}" alt="Profile image" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" />',
          '    <span class="status-badge badge-success" style="margin-left:10px;">&#10003; Profile image uploaded</span>',
          '  </div>',
          '</div>'
        ].join(''),
        link: function (scope, element) {
          scope.uploading = false;
          var fileInput = element.find('input')[0];
          fileInput.addEventListener('change', function () {
            if (!fileInput.files || !fileInput.files[0]) return;
            var file = fileInput.files[0];
            scope.$apply(function () { scope.uploading = true; });
            ApiService.upload('/auth/profile-image', file).then(function (res) {
              scope.uploading = false;
              scope.asset = res.data.user.profile_image || res.data.profile_image;
              ToastService.success('Professional profile image uploaded.');
            }, function (err) {
              scope.uploading = false;
              ToastService.error(err.message || 'Profile image upload failed.');
            });
          });
        }
      };
    }]);
})();
