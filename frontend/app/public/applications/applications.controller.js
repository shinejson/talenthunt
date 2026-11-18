(function () {
  'use strict';

  var MB = 1024 * 1024;
  var FILES = { photo: { label: 'Photo', limit: 5 }, demo_video_1: { label: 'Demo 1', limit: 40 }, demo_video_2: { label: 'Demo 2', limit: 40 } };
  var FIELD_LABELS = {
    competition_id: 'Competition', category_id: 'Category', full_name: 'Full name', stage_name: 'Stage name',
    contact_email: 'Email', contact_phone: 'Phone', date_of_birth: 'Date of birth', location: 'City and region',
    is_group: 'Entry type', group_name: 'Group details', group_member_count: 'Number of performers', title: 'Act title',
    description: 'About your act', biography: 'Biography', genre: 'Genre', external_video_url: 'Demo 1 link',
    guardian_name: 'Guardian name', guardian_contact: 'Guardian contact', guardian_consent: 'Guardian consent'
  };

  function localDate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  angular.module('talentHuntApp')
    .factory('ApplicationTrackingState', function () { return {}; })
    .directive('thApplicationFile', ['$parse', function ($parse) {
      return {
        link: function (scope, element, attrs) {
          var assign = $parse(attrs.thApplicationFile).assign;
          function selectFile() {
            var file = element[0].files[0] || null;
            scope.$evalAsync(function () { assign(scope, file); });
          }
          element.on('change', selectFile);
          scope.$on('$destroy', function () { element.off('change', selectFile); });
        }
      };
    }])
    .controller('GuestApplicationController', ['$location', '$window', '$timeout', 'ApiService', 'ApplicationTrackingState', 'ToastService',
      function ($location, $window, $timeout, ApiService, ApplicationTrackingState, ToastService) {
        var vm = this;
        vm.today = localDate(new Date());
        vm.form = { is_group: false, consent_accepted: false, rights_declaration: false };
        vm.files = {};
        vm.competitions = [];
        vm.demoSource = 'file';
        var competitionSlug = $location.search().competition;

        vm.load = function () {
          vm.loading = true;
          vm.loadError = '';
          ApiService.get('/applications/options').then(function (res) {
            vm.competitions = res.data;
            vm.competition = vm.competitions.find(function (item) { return item.slug === competitionSlug; }) ||
              (vm.competitions.length === 1 ? vm.competitions[0] : null);
            vm.competitionChanged();
          }, function (err) { vm.loadError = err.message; }).finally(function () { vm.loading = false; });
        };
        vm.competitionChanged = function () {
          var categories = vm.competition ? vm.competition.categories : [];
          vm.form.category_id = categories.length === 1 ? categories[0].id : null;
        };
        vm.needsGuardian = function () {
          if (!vm.form.date_of_birth || !vm.competition || !vm.competition.require_guardian_for_minors) return false;
          var dob = vm.form.date_of_birth;
          var today = new Date();
          var age = today.getFullYear() - dob.getFullYear();
          if (today.getMonth() < dob.getMonth() ||
              (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
          return age < 18;
        };
        vm.submit = function (form) {
          if (vm.submitting || form.$invalid || !vm.competition) return;
          vm.error = '';
          vm.fieldErrors = [];
          var payload = angular.copy(vm.form);
          payload.competition_id = vm.competition.id;
          payload.date_of_birth = localDate(payload.date_of_birth);
          if (!payload.is_group) {
            delete payload.group_name;
            delete payload.group_member_count;
          }
          if (!vm.needsGuardian()) {
            delete payload.guardian_name;
            delete payload.guardian_contact;
            delete payload.guardian_consent;
          }
          if (vm.demoSource === 'file') {
            delete payload.external_video_url;
            if (!vm.files.demo_video_1) {
              vm.error = 'Choose a video file for Demo 1 or switch to a hosted demo link.';
              return;
            }
          }

          var formData = new FormData();
          formData.append('application', JSON.stringify(payload));
          angular.forEach(FILES, function (details, field) {
            var file = vm.files[field];
            if (!file || (field === 'demo_video_1' && vm.demoSource !== 'file')) return;
            if (!file.size || file.size > details.limit * MB) {
              vm.fieldErrors.push(details.label + ': Choose a non-empty file no larger than ' + details.limit + ' MB.');
            } else {
              formData.append(field, file);
            }
          });
          if (vm.fieldErrors.length) {
            vm.error = 'Check the selected files.';
            return;
          }

          vm.submitting = true;
          vm.progress = 0;
          ApiService.postForm('/applications/guest', formData, function (event) {
            if (event.lengthComputable) vm.progress = Math.floor((event.loaded / event.total) * 100);
          }).then(function (res) {
            vm.receipt = res.data;
            vm.contactEmail = payload.contact_email;
            vm.form = {};
            vm.files = {};
            $timeout(function () {
              var heading = $window.document.getElementById('application-receipt-heading');
              if (heading) heading.focus();
              $window.scrollTo(0, 0);
            });
          }, function (err) {
            vm.error = err.status === 413 ? 'The upload is too large. Try smaller video files.' : err.message;
            angular.forEach(err.fields, function (messages, field) {
              var label = FILES[field] ? FILES[field].label : FIELD_LABELS[field];
              vm.fieldErrors.push((label ? label + ': ' : '') + messages.join(' '));
            });
          }).finally(function () { vm.submitting = false; });
        };
        vm.copyCode = function () {
          if (!$window.navigator.clipboard) {
            ToastService.info('Select the tracking code above to copy it.');
            return;
          }
          $window.navigator.clipboard.writeText(vm.receipt.tracking_code).then(function () {
            $timeout(function () { ToastService.success('Tracking code copied.'); });
          }, function () {
            $timeout(function () { ToastService.info('Select the tracking code above to copy it.'); });
          });
        };
        vm.prepareTracking = function () {
          ApplicationTrackingState.prefill = { tracking_code: vm.receipt.tracking_code, contact_email: vm.contactEmail };
        };
        vm.load();
      }
    ])
    .controller('TrackApplicationController', ['ApiService', 'ApplicationTrackingState', function (ApiService, ApplicationTrackingState) {
      var vm = this;
      vm.form = ApplicationTrackingState.prefill || {};
      delete ApplicationTrackingState.prefill;
      vm.messages = {
        SUBMITTED: 'We received your application. It is waiting for review.',
        UNDER_REVIEW: 'The review team is assessing your application.',
        APPROVED: 'Your application has been approved. A nomination decision is still pending.',
        CHANGES_REQUESTED: 'The review team has asked for changes. See the feedback below and contact support with your tracking code.',
        REJECTED: 'Your application was not selected for this competition.',
        NOMINATED: 'Congratulations! Check your email for instructions to access your nominee portal.',
        WITHDRAWN: 'This application has been withdrawn.'
      };
      vm.lookup = function () {
        if (vm.loading) return;
        vm.loading = true;
        vm.error = '';
        vm.result = null;
        ApiService.post('/applications/track', vm.form).then(function (res) {
          vm.result = res.data;
        }, function (err) {
          vm.error = err.message;
        }).finally(function () { vm.loading = false; });
      };
    }]);
})();
