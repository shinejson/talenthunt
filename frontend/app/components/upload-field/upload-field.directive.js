(function () {
  'use strict';

  angular.module('talentHuntApp')
    .directive('thUploadField', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      return {
        restrict: 'E',
        scope: {
          asset: '=',
          onUploaded: '&'
        },
        template: [
          '<div class="card" style="background: var(--bg-subtle); padding: 14px;">',
          '  <label class="form-label">Direct Demo File Upload (MP4, MOV, WEBM, MP3, WAV, JPG, PNG &mdash; max 40 MB)</label>',
          '  <input type="file" class="form-control" accept=".mp4,.mov,.webm,.mp3,.wav,.jpg,.jpeg,.png,.gif" />',
          '  <div class="mt-1" ng-if="uploading"><span class="muted">Uploading &amp; running security scan...</span></div>',
          '  <div class="mt-1" ng-if="asset">',
          '    <span class="status-badge badge-success">&#10003; Uploaded: {{ asset.original_filename }} ({{ (asset.size_bytes / 1024) | number:0 }} KB)</span>',
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
            ApiService.upload('/applications/media', file).then(function (res) {
              scope.uploading = false;
              scope.asset = res.data;
              ToastService.success('Demo file uploaded and verified.');
              if (scope.onUploaded) scope.onUploaded({ asset: res.data });
            }, function (err) {
              scope.uploading = false;
              ToastService.error(err.message || 'Upload failed.');
            });
          });
        }
      };
    }]);
})();
