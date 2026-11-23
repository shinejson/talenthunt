(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminJudgingController', [
      '$location', '$sce', 'ApiService', 'ToastService', 'AuthService', 'PermissionsService',
      function ($location, $sce, ApiService, ToastService, AuthService, PermissionsService) {
        var vm = this;

        vm.perms = PermissionsService;
        vm.currentUser = AuthService.state.user;
        vm.competitions = [];
        vm.selectedCompId = '';
        vm.rounds = [];
        vm.selectedRoundId = $location.search().round || '';
        vm.currentRound = null;

        vm.activeTab = 'scoring'; // 'scoring' | 'tally'
        vm.isLoading = false;
        vm.isSubmitting = false;
        vm.isSyncing = false;

        // Nominees in the selected round
        vm.nominees = [];
        vm.selectedNomineeIndex = 0;
        vm.selectedNominee = null;

        // Active criteria & score state
        vm.criteria = [];
        vm.criteriaScores = {};
        vm.totalScore = 0.0;
        vm.remarks = '';
        vm.isFinal = true;

        // Video embed
        vm.videoEmbedUrl = '';
        vm.embedType = 'none'; // 'youtube' | 'vimeo' | 'direct_video' | 'direct_audio' | 'link' | 'none'
        vm.trustedEmbedUrl = '';

        // Tally sheet state
        vm.tallyData = null;
        vm.selectedRemarksNominee = null;

        // Quick tags for feedback
        vm.quickTags = [
          '⚡ Electric Energy',
          '🎤 Pitch Perfect',
          '🎯 Flawless Technique',
          '💡 Highly Original',
          '💫 Star Presence',
          '⚠️ Needs Breath Control',
          '🔥 Crowd Favourite',
          '👏 Powerful Emotion',
          '🎶 Great Dynamic Range',
          '✨ Captivating Delivery'
        ];

        // 1. Initial Load: Competitions and rounds
        vm.init = function () {
          vm.isLoading = true;
          ApiService.get('/admin/judging/competitions-and-rounds')
            .then(function (res) {
              vm.competitions = res.data || [];
              if (vm.competitions.length > 0) {
                // Find competition with rounds
                var initialComp = null;
                for (var i = 0; i < vm.competitions.length; i++) {
                  if (vm.competitions[i].rounds && vm.competitions[i].rounds.length > 0) {
                    initialComp = vm.competitions[i];
                    break;
                  }
                }
                if (!initialComp) initialComp = vm.competitions[0];
                vm.selectedCompId = initialComp.id;
                vm.onCompetitionChange();
              }
            })
            .catch(function (err) {
              ToastService.error(err.message || 'Failed to load judging rounds.');
            })
            .finally(function () {
              vm.isLoading = false;
            });
        };

        vm.onCompetitionChange = function () {
          var comp = null;
          for (var i = 0; i < vm.competitions.length; i++) {
            if (vm.competitions[i].id === vm.selectedCompId) {
              comp = vm.competitions[i];
              break;
            }
          }
          vm.rounds = comp ? (comp.rounds || []) : [];

          // Choose round: either match url query param, or first active/open, or first in list
          var targetRoundId = '';
          if (vm.selectedRoundId) {
            for (var r = 0; r < vm.rounds.length; r++) {
              if (vm.rounds[r].id === vm.selectedRoundId) {
                targetRoundId = vm.selectedRoundId;
                break;
              }
            }
          }
          if (!targetRoundId) {
            for (var k = 0; k < vm.rounds.length; k++) {
              if (vm.rounds[k].status === 'OPEN') {
                targetRoundId = vm.rounds[k].id;
                break;
              }
            }
          }
          if (!targetRoundId && vm.rounds.length > 0) {
            targetRoundId = vm.rounds[0].id;
          }

          vm.selectedRoundId = targetRoundId;
          if (vm.selectedRoundId) {
            vm.loadRoundData();
          } else {
            vm.nominees = [];
            vm.selectedNominee = null;
            vm.currentRound = null;
          }
        };

        // 2. Load Nominees for Selected Round
        vm.loadRoundData = function () {
          if (!vm.selectedRoundId) return;
          vm.isLoading = true;

          ApiService.get('/admin/judging/round/' + vm.selectedRoundId + '/nominees')
            .then(function (res) {
              var data = res.data || {};
              vm.currentRound = data.round || null;
              vm.criteria = data.criteria || [];
              vm.nominees = data.nominees || [];

              if (vm.nominees.length > 0) {
                // Keep selected index within bounds
                if (vm.selectedNomineeIndex >= vm.nominees.length) {
                  vm.selectedNomineeIndex = 0;
                }
                vm.selectNominee(vm.selectedNomineeIndex);
              } else {
                vm.selectedNominee = null;
                vm.videoEmbedUrl = '';
                vm.trustedEmbedUrl = '';
              }

              if (vm.activeTab === 'tally') {
                vm.loadTally();
              }
            })
            .catch(function (err) {
              ToastService.error(err.message || 'Failed to load round nominees.');
            })
            .finally(function () {
              vm.isLoading = false;
            });
        };

        // 3. Select Nominee & Setup Scorecard + Video
        vm.selectNominee = function (index) {
          if (index < 0 || index >= vm.nominees.length) return;
          vm.selectedNomineeIndex = index;
          vm.selectedNominee = vm.nominees[index];

          // Setup video embed
          vm.setupVideoEmbed(vm.selectedNominee);

          // Populate scorecard from existing judge score or initialize defaults
          vm.criteriaScores = {};
          if (vm.selectedNominee.my_score && vm.selectedNominee.my_score.criteria_scores) {
            var existing = vm.selectedNominee.my_score.criteria_scores;
            angular.forEach(vm.criteria, function (c) {
              vm.criteriaScores[c.key] = existing[c.key] !== undefined ? Number(existing[c.key]) : 0;
            });
            vm.remarks = vm.selectedNominee.my_score.remarks || '';
            vm.isFinal = vm.selectedNominee.my_score.is_final !== undefined ? vm.selectedNominee.my_score.is_final : true;
          } else {
            // Default initial scores: 20 on each criteria (80 total)
            angular.forEach(vm.criteria, function (c) {
              vm.criteriaScores[c.key] = 20;
            });
            vm.remarks = '';
            vm.isFinal = true;
          }

          vm.calculateTotal();
        };

        vm.nextNominee = function () {
          if (vm.selectedNomineeIndex + 1 < vm.nominees.length) {
            vm.selectNominee(vm.selectedNomineeIndex + 1);
          } else {
            ToastService.info('You have reached the last nominee in this round.');
          }
        };

        vm.prevNominee = function () {
          if (vm.selectedNomineeIndex - 1 >= 0) {
            vm.selectNominee(vm.selectedNomineeIndex - 1);
          }
        };

        // 4. Video Embed Resolver
        vm.setupVideoEmbed = function (nominee) {
          vm.videoEmbedUrl = '';
          vm.trustedEmbedUrl = '';
          vm.embedType = 'none';

          if (!nominee || !nominee.performance) return;
          var perf = nominee.performance;

          if (perf.external_video_url) {
            var url = String(perf.external_video_url).trim();

            // Check YouTube
            var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
            if (ytMatch && ytMatch[1]) {
              vm.videoEmbedUrl = 'https://www.youtube-nocookie.com/embed/' + ytMatch[1] + '?rel=0&modestbranding=1';
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(vm.videoEmbedUrl);
              vm.embedType = 'youtube';
              return;
            }

            // Check Vimeo
            var vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
            if (vimeoMatch && vimeoMatch[1]) {
              vm.videoEmbedUrl = 'https://player.vimeo.com/video/' + vimeoMatch[1] + '?dnt=1&title=0&byline=0&portrait=0';
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(vm.videoEmbedUrl);
              vm.embedType = 'vimeo';
              return;
            }

            // Check SoundCloud
            if (url.indexOf('soundcloud.com') !== -1) {
              vm.videoEmbedUrl = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&color=%23d4af37&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false';
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(vm.videoEmbedUrl);
              vm.embedType = 'soundcloud';
              return;
            }

            // Direct mp4 / webm
            if (url.match(/\.(mp4|webm|ogg)$/i)) {
              vm.videoEmbedUrl = url;
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(url);
              vm.embedType = 'direct_video';
              return;
            }

            // Fallback generic web link
            vm.videoEmbedUrl = url;
            vm.trustedEmbedUrl = $sce.trustAsResourceUrl(url);
            vm.embedType = 'link';
            return;
          }

          // Check Media Asset
          if (perf.media_asset && perf.media_asset.public_url) {
            var assetUrl = perf.media_asset.public_url;
            var assetType = (perf.media_asset.asset_type || '').toUpperCase();
            if (assetType === 'VIDEO' || assetUrl.match(/\.(mp4|webm|ogg)$/i)) {
              vm.videoEmbedUrl = assetUrl;
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(assetUrl);
              vm.embedType = 'direct_video';
              return;
            }
            if (assetType === 'AUDIO' || assetUrl.match(/\.(mp3|wav|m4a|aac)$/i)) {
              vm.videoEmbedUrl = assetUrl;
              vm.trustedEmbedUrl = $sce.trustAsResourceUrl(assetUrl);
              vm.embedType = 'direct_audio';
              return;
            }
          }
        };

        // 5. Score Calculations
        vm.calculateTotal = function () {
          var sum = 0;
          angular.forEach(vm.criteria, function (c) {
            var val = parseFloat(vm.criteriaScores[c.key]);
            if (!isNaN(val) && val >= 0) {
              if (val > c.max_score) {
                val = c.max_score;
                vm.criteriaScores[c.key] = val;
              }
              sum += val;
            }
          });
          vm.totalScore = Math.min(100, Math.round(sum * 10) / 10);
        };

        vm.setCriteriaScore = function (key, value) {
          vm.criteriaScores[key] = parseFloat(value) || 0;
          vm.calculateTotal();
        };

        vm.getScoreBadgeClass = function (score) {
          var s = parseFloat(score) || 0;
          if (s >= 90) return 'badge-gold';
          if (s >= 75) return 'badge-success';
          if (s >= 60) return 'badge-info';
          if (s >= 50) return 'badge-warning';
          return 'badge-danger';
        };

        vm.getScoreGrade = function (score) {
          var s = parseFloat(score) || 0;
          if (s >= 90) return '⭐ Outstanding (Finalist Calibre)';
          if (s >= 75) return '🟢 Excellent (Strong Qualifier)';
          if (s >= 60) return '🔵 Good (Solid Performance)';
          if (s >= 50) return '🟡 Average (Developing Talent)';
          return '🔴 Needs Improvement';
        };

        vm.appendRemarkTag = function (tag) {
          if (!vm.remarks) {
            vm.remarks = tag;
          } else {
            vm.remarks = vm.remarks + ' • ' + tag;
          }
        };

        // 6. Submit Scorecard
        vm.submitScore = function () {
          if (!vm.selectedNominee || !vm.selectedRoundId) return;

          vm.calculateTotal();
          vm.isSubmitting = true;

          var payload = {
            round_id: vm.selectedRoundId,
            nominee_id: vm.selectedNominee.nominee_id,
            criteria_scores: vm.criteriaScores,
            total_score: vm.totalScore,
            remarks: vm.remarks,
            is_final: vm.isFinal
          };

          ApiService.post('/admin/judging/score', payload)
            .then(function (res) {
              var data = res.data || {};
              ToastService.success('Scorecard saved for ' + vm.selectedNominee.public_name + ' (' + vm.totalScore + '%)');

              // Update local state
              vm.selectedNominee.my_score = data.score;
              vm.selectedNominee.has_scored = true;
              vm.selectedNominee.judge_score = data.consensus_judge_score;

              // Refresh tally if loaded
              if (vm.tallyData) {
                vm.loadTally();
              }
            })
            .catch(function (err) {
              ToastService.error(err.message || 'Failed to submit scorecard.');
            })
            .finally(function () {
              vm.isSubmitting = false;
            });
        };

        // 7. Master Tally Sheet
        vm.switchTab = function (tab) {
          vm.activeTab = tab;
          if (tab === 'tally') {
            vm.loadTally();
          }
        };

        vm.loadTally = function () {
          if (!vm.selectedRoundId) return;
          vm.isLoading = true;

          ApiService.get('/admin/judging/round/' + vm.selectedRoundId + '/tally')
            .then(function (res) {
              vm.tallyData = res.data || null;
            })
            .catch(function (err) {
              ToastService.error(err.message || 'Failed to load master tally sheet.');
            })
            .finally(function () {
              vm.isLoading = false;
            });
        };

        vm.syncTally = function () {
          if (!vm.selectedRoundId) return;
          vm.isSyncing = true;

          ApiService.post('/admin/judging/round/' + vm.selectedRoundId + '/sync-tally')
            .then(function (res) {
              var msg = (res.data && res.data.message) || 'Consensus judge scores synchronized successfully.';
              ToastService.success(msg);
              vm.loadTally();
              vm.loadRoundData();
            })
            .catch(function (err) {
              ToastService.error(err.message || 'Failed to sync tally scores.');
            })
            .finally(function () {
              vm.isSyncing = false;
            });
        };

        vm.openRemarksModal = function (nominee) {
          vm.selectedRemarksNominee = nominee;
        };

        vm.closeRemarksModal = function () {
          vm.selectedRemarksNominee = null;
        };

        vm.printTally = function () {
          window.print();
        };

        vm.exportTallyCsv = function () {
          if (!vm.tallyData || !vm.tallyData.nominees || vm.tallyData.nominees.length === 0) {
            ToastService.info('No tally data available to export.');
            return;
          }

          var headers = ['Rank', 'Nominee Name', 'Category', 'Status', 'Consensus Score (%)', 'Judges Count'];
          var judges = vm.tallyData.judges || [];
          for (var j = 0; j < judges.length; j++) {
            headers.push('Judge: ' + judges[j].name + ' (%)');
          }
          headers.push('All Judge Remarks');

          var rows = [headers.map(function (h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',')];

          angular.forEach(vm.tallyData.nominees, function (n) {
            var row = [
              n.rank,
              '"' + (n.public_name || '').replace(/"/g, '""') + '"',
              '"' + (n.category_name || '').replace(/"/g, '""') + '"',
              n.status,
              n.consensus_score,
              n.judge_count
            ];

            // Each judge score
            for (var k = 0; k < judges.length; k++) {
              var jId = judges[k].id;
              var js = n.judge_scores ? n.judge_scores[jId] : null;
              row.push(js ? js.total_score : '-');
            }

            // Combined remarks
            var remText = (n.remarks || []).map(function (r) {
              return r.judge_name + ': ' + r.remarks;
            }).join(' | ');
            row.push('"' + remText.replace(/"/g, '""') + '"');

            rows.push(row.join(','));
          });

          var csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
          var link = document.createElement('a');
          var fileName = 'Tally-Sheet-' + (vm.tallyData.round.name || 'Round').replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
          link.setAttribute('href', csvContent);
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          ToastService.success('Tally sheet exported to CSV.');
        };

        vm.init();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/judging.html', [
        '<div class="container portal-layout judging-container">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="judging-main-area">',

        // Header and Selectors
        '    <div class="card mb-3 judging-header-card">',
        '      <div class="flex-between flex-wrap gap-2 mb-2">',
        '        <div>',
        '          <div class="flex-row gap-2" style="align-items:center;">',
        '            <h1 style="margin:0;font-size:1.45rem;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="award" size="22" style="color:var(--accent);"></th-icon>',
        '              <span>Judges Scoring Console &amp; Tally Sheet</span>',
        '            </h1>',
        '            <span class="badge" ng-class="vm.currentRound.status === \'OPEN\' ? \'badge-success\' : \'badge-subtle\'">',
        '              {{ vm.currentRound.status || "DRAFT" }}',
        '            </span>',
        '            <span class="badge badge-gold" ng-if="vm.currentRound.is_finale">🏆 Grand Finale</span>',
        '          </div>',
        '          <p class="muted" style="margin:4px 0 0 0;font-size:0.88rem;">',
        '            Evaluate nominee video auditions, rate individual criteria (100% total), record judge remarks, and view the live round tally sheet.',
        '          </p>',
        '        </div>',
        '        <div class="tab-pill-group" style="display:flex;gap:4px;background:var(--bg-subtle);padding:4px;border-radius:8px;">',
        '          <button type="button" class="btn btn-sm" ng-class="vm.activeTab === \'scoring\' ? \'btn-primary\' : \'btn-ghost\'" ng-click="vm.switchTab(\'scoring\')">',
        '            <th-icon name="sliders" size="14"></th-icon><span>Scorecard &amp; Video</span>',
        '          </button>',
        '          <button type="button" class="btn btn-sm" ng-class="vm.activeTab === \'tally\' ? \'btn-primary\' : \'btn-ghost\'" ng-click="vm.switchTab(\'tally\')">',
        '            <th-icon name="clipboard-check" size="14"></th-icon><span>Master Tally Sheet</span>',
        '          </button>',
        '        </div>',
        '      </div>',

        // Competition & Round Selectors
        '      <div class="grid-2 gap-2" style="background:rgba(255,255,255,0.02);padding:12px;border-radius:6px;border:1px solid var(--border);">',
        '        <div class="form-group" style="margin-bottom:0;">',
        '          <label class="form-label" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Competition</label>',
        '          <select class="form-control" ng-model="vm.selectedCompId" ng-change="vm.onCompetitionChange()">',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }} ({{ c.rounds.length }} rounds)</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group" style="margin-bottom:0;">',
        '          <label class="form-label" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Competition Level / Round</label>',
        '          <select class="form-control" ng-model="vm.selectedRoundId" ng-change="vm.loadRoundData()">',
        '            <option ng-repeat="r in vm.rounds" value="{{ r.id }}">',
        '              Level {{ r.sequence_no }}: {{ r.name }} &bull; {{ r.nominee_count }} Nominees ({{ r.status }})',
        '            </option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        // ---------------------------------------------------------------------
        // TAB 1: SCORING CONSOLE & VIDEO PLAYER
        // ---------------------------------------------------------------------
        '    <div ng-if="vm.activeTab === \'scoring\'">',

        // Nominees Carousel / Horizontal Selector
        '      <div class="card mb-3" style="padding:12px;" ng-if="vm.nominees.length > 0">',
        '        <div class="flex-between mb-2">',
        '          <span style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);">',
        '            Contestants in this Round ({{ vm.nominees.length }}) &bull; You Scored {{ (vm.nominees | filter:{has_scored:true}).length }} of {{ vm.nominees.length }}',
        '          </span>',
        '          <div class="flex-row gap-1">',
        '            <button type="button" class="btn btn-xs btn-secondary" ng-click="vm.prevNominee()" ng-disabled="vm.selectedNomineeIndex === 0" title="Previous Nominee">',
        '              <th-icon name="arrow-left" size="13"></th-icon>',
        '            </button>',
        '            <span style="font-size:0.82rem;padding:2px 8px;" class="muted">{{ vm.selectedNomineeIndex + 1 }} / {{ vm.nominees.length }}</span>',
        '            <button type="button" class="btn btn-xs btn-secondary" ng-click="vm.nextNominee()" ng-disabled="vm.selectedNomineeIndex === vm.nominees.length - 1" title="Next Nominee">',
        '              <th-icon name="arrow-right" size="13"></th-icon>',
        '            </button>',
        '          </div>',
        '        </div>',

        '        <div class="nominee-strip" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">',
        '          <div class="nominee-strip-card" ng-repeat="nom in vm.nominees"',
        '               ng-class="{\'selected\': $index === vm.selectedNomineeIndex, \'scored\': nom.has_scored}"',
        '               ng-click="vm.selectNominee($index)"',
        '               style="flex:0 0 170px;cursor:pointer;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);transition:all 0.15s ease;">',
        '            <div style="display:flex;align-items:center;gap:8px;">',
        '              <div style="width:36px;height:36px;border-radius:50%;background:var(--bg-subtle);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;border:1px solid var(--border);flex-shrink:0;overflow:hidden;">',
        '                <img ng-if="nom.profile_image && nom.profile_image.public_url" ng-src="{{ nom.profile_image.public_url }}" style="width:100%;height:100%;object-fit:cover;" alt="" />',
        '                <span ng-if="!nom.profile_image || !nom.profile_image.public_url">{{ nom.public_name | initials }}</span>',
        '              </div>',
        '              <div style="min-width:0;flex:1;">',
        '                <div style="font-weight:700;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ nom.public_name }}</div>',
        '                <div class="muted" style="font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ nom.category_name }}</div>',
        '              </div>',
        '            </div>',
        '            <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;font-size:0.72rem;">',
        '              <span ng-if="nom.has_scored" class="badge badge-success" style="padding:2px 6px;font-size:0.7rem;">',
        '                ✓ {{ nom.my_score.total_score }}%',
        '              </span>',
        '              <span ng-if="!nom.has_scored" class="badge badge-warning" style="padding:2px 6px;font-size:0.7rem;">',
        '                Pending',
        '              </span>',
        '              <span class="muted" title="Consensus Round Score" ng-if="nom.judge_score">Avg: {{ nom.judge_score }}%</span>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',

        // Empty state when no nominees in round
        '      <div class="card text-center" style="padding:48px 24px;" ng-if="vm.nominees.length === 0 && !vm.isLoading">',
        '        <th-icon name="award" size="48" style="color:var(--text-muted);margin-bottom:12px;opacity:0.6;"></th-icon>',
        '        <h2 style="margin:0 0 8px 0;font-size:1.25rem;">No Nominees Enrolled in this Round</h2>',
        '        <p class="muted" style="max-width:500px;margin:0 auto 16px auto;">',
        '          This round does not have active contestant entries enrolled yet. Select another round or enroll contestants from the Nominees management page.',
        '        </p>',
        '      </div>',

        // Two-Column Grid: Video Player + Scorecard
        '      <div class="grid-2 gap-3" ng-if="vm.selectedNominee">',

        // LEFT COLUMN: Video Player & Performance Details
        '        <div class="card performance-view-card" style="padding:16px;">',
        '          <div class="flex-between mb-2">',
        '            <div>',
        '              <span class="badge badge-primary" style="font-size:0.75rem;margin-bottom:4px;">{{ vm.selectedNominee.category_name }}</span>',
        '              <h2 style="margin:2px 0 0 0;font-size:1.2rem;">{{ vm.selectedNominee.public_name }}</h2>',
        '              <div class="muted" style="font-size:0.85rem;" ng-if="vm.selectedNominee.location">📍 {{ vm.selectedNominee.location }}</div>',
        '            </div>',
        '            <div class="text-right">',
        '              <span class="badge" ng-class="vm.selectedNominee.has_scored ? \'badge-success\' : \'badge-subtle\'">',
        '                {{ vm.selectedNominee.has_scored ? "Scored by You" : "Not Scored Yet" }}',
        '              </span>',
        '              <div class="muted" style="font-size:0.75rem;margin-top:3px;">',
        '                {{ vm.selectedNominee.total_judges_scored }} judge(s) evaluated',
        '              </div>',
        '            </div>',
        '          </div>',

        // Video Player Box
        '          <div class="video-player-container mb-2" style="position:relative;background:#000;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);min-height:280px;display:flex;align-items:center;justify-content:center;">',

        // YouTube Embed
        '            <div ng-if="vm.embedType === \'youtube\' && vm.trustedEmbedUrl" style="width:100%;aspect-ratio:16/9;">',
        '              <iframe ng-src="{{ vm.trustedEmbedUrl }}" style="width:100%;height:100%;border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"></iframe>',
        '            </div>',

        // Vimeo Embed
        '            <div ng-if="vm.embedType === \'vimeo\' && vm.trustedEmbedUrl" style="width:100%;aspect-ratio:16/9;">',
        '              <iframe ng-src="{{ vm.trustedEmbedUrl }}" style="width:100%;height:100%;border:none;" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>',
        '            </div>',

        // SoundCloud Embed
        '            <div ng-if="vm.embedType === \'soundcloud\' && vm.trustedEmbedUrl" style="width:100%;padding:16px;">',
        '              <iframe ng-src="{{ vm.trustedEmbedUrl }}" style="width:100%;height:166px;border:none;" scrolling="no" frameborder="no" allow="autoplay; encrypted-media"></iframe>',
        '            </div>',

        // Direct Video File
        '            <div ng-if="vm.embedType === \'direct_video\' && vm.trustedEmbedUrl" style="width:100%;">',
        '              <video controls style="width:100%;max-height:400px;background:#000;display:block;" ng-src="{{ vm.trustedEmbedUrl }}"></video>',
        '            </div>',

        // Direct Audio File
        '            <div ng-if="vm.embedType === \'direct_audio\' && vm.trustedEmbedUrl" style="width:100%;padding:32px 16px;text-align:center;">',
        '              <th-icon name="music" size="48" style="color:var(--accent);margin-bottom:12px;"></th-icon>',
        '              <h4 style="margin:0 0 12px 0;">Audition Audio Track</h4>',
        '              <audio controls style="width:100%;max-width:400px;" ng-src="{{ vm.trustedEmbedUrl }}"></audio>',
        '            </div>',

        // External Link Fallback
        '            <div ng-if="vm.embedType === \'link\'" style="padding:40px 20px;text-align:center;">',
        '              <th-icon name="external-link" size="36" style="color:var(--accent);margin-bottom:12px;"></th-icon>',
        '              <h4 style="margin:0 0 6px 0;">External Performance Link</h4>',
        '              <p class="muted" style="margin:0 0 16px 0;font-size:0.85rem;word-break:break-all;">{{ vm.videoEmbedUrl }}</p>',
        '              <a href="{{ vm.videoEmbedUrl }}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary">',
        '                <th-icon name="external-link" size="14"></th-icon><span>Open Video in New Tab</span>',
        '              </a>',
        '            </div>',

        // No Media Available Fallback
        '            <div ng-if="vm.embedType === \'none\'" style="padding:40px 20px;text-align:center;">',
        '              <th-icon name="film" size="36" style="color:var(--text-muted);margin-bottom:10px;"></th-icon>',
        '              <h4 style="margin:0 0 6px 0;color:var(--text-muted);">No Performance Media Linked</h4>',
        '              <p class="muted" style="margin:0;font-size:0.85rem;">Review contestant bio and act details below.</p>',
        '            </div>',
        '          </div>',

        // Helper bar for direct external access
        '          <div ng-if="vm.selectedNominee.performance.external_video_url" class="flex-between mb-3" style="padding:6px 12px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">',
        '            <span class="muted" style="display:flex;align-items:center;gap:6px;">',
        '              <th-icon name="film" size="13"></th-icon>',
        '              <span>Source Link:</span>',
        '            </span>',
        '            <a ng-href="{{ vm.selectedNominee.performance.external_video_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-secondary" style="display:inline-flex;align-items:center;gap:4px;">',
        '              <th-icon name="external-link" size="12"></th-icon><span>Open in External Tab ↗</span>',
        '            </a>',
        '          </div>',

        // Performance Details Accordion / Card
        '          <div style="background:var(--bg-subtle);padding:14px;border-radius:6px;border:1px solid var(--border);">',
        '            <div class="flex-between mb-1">',
        '              <strong style="font-size:0.95rem;color:var(--text);">',
        '                {{ vm.selectedNominee.performance.title || "Showcase Act" }}',
        '              </strong>',
        '              <a ng-if="vm.videoEmbedUrl" href="{{ vm.videoEmbedUrl }}" target="_blank" rel="noopener noreferrer" class="muted" style="font-size:0.78rem;display:flex;align-items:center;gap:4px;">',
        '                <th-icon name="external-link" size="12"></th-icon><span>Direct Link</span>',
        '              </a>',
        '            </div>',
        '            <p style="margin:0 0 10px 0;font-size:0.86rem;line-height:1.5;color:var(--text-muted);">',
        '              {{ vm.selectedNominee.performance.description }}',
        '            </p>',
        '            <div ng-if="vm.selectedNominee.performance.biography" style="border-top:1px dashed var(--border);padding-top:8px;font-size:0.82rem;color:var(--text-muted);">',
        '              <strong>Contestant Bio:</strong> {{ vm.selectedNominee.performance.biography }}',
        '            </div>',
        '          </div>',
        '        </div>',

        // RIGHT COLUMN: Interactive Criteria Scorecard & Remarks
        '        <div class="card scorecard-card" style="padding:16px;">',

        // Dynamic Score Gauge Banner
        '          <div class="score-summary-banner mb-3" style="background:linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(30,30,30,0.7) 100%);border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;">',
        '            <div>',
        '              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);">Official Judge Scorecard</div>',
        '              <div style="font-size:0.86rem;font-weight:600;margin-top:2px;">{{ vm.getScoreGrade(vm.totalScore) }}</div>',
        '            </div>',
        '            <div class="text-right" style="display:flex;align-items:baseline;gap:4px;">',
        '              <span style="font-size:2.2rem;font-weight:900;line-height:1;color:var(--accent);">{{ vm.totalScore }}</span>',
        '              <span style="font-size:1.1rem;font-weight:700;color:var(--text-muted);">/ 100%</span>',
        '            </div>',
        '          </div>',

        // Progress bar for score
        '          <div class="progress-bar-container mb-3" style="height:6px;background:var(--bg-subtle);border-radius:3px;overflow:hidden;">',
        '            <div style="height:100%;transition:width 0.2s ease;border-radius:3px;"',
        '                 ng-style="{\'width\': vm.totalScore + \'%\', \'background\': vm.totalScore >= 90 ? \'#eab308\' : (vm.totalScore >= 75 ? \'#22c55e\' : (vm.totalScore >= 60 ? \'#3b82f6\' : \'#f97316\'))}">',
        '            </div>',
        '          </div>',

        // Criteria Sliders Form
        '          <form ng-submit="vm.submitScore()">',
        '            <div class="criteria-list mb-3">',
        '              <div class="criteria-item mb-3" ng-repeat="crit in vm.criteria" style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:12px;">',
        '                <div class="flex-between mb-1">',
        '                  <div>',
        '                    <strong style="font-size:0.9rem;">{{ crit.label }}</strong>',
        '                    <div class="muted" style="font-size:0.76rem;">{{ crit.description }}</div>',
        '                  </div>',
        '                  <div style="display:flex;align-items:center;gap:6px;">',
        '                    <input type="number" step="0.5" min="0" max="{{ crit.max_score }}"',
        '                           class="form-control form-control-sm text-center"',
        '                           style="width:65px;font-weight:700;font-size:0.95rem;padding:2px 4px;"',
        '                           ng-model="vm.criteriaScores[crit.key]"',
        '                           ng-change="vm.calculateTotal()" />',
        '                    <span class="muted" style="font-size:0.8rem;white-space:nowrap;">/ {{ crit.max_score }}</span>',
        '                  </div>',
        '                </div>',

        // Slider control
        '                <div style="margin-top:8px;">',
        '                  <input type="range" min="0" max="{{ crit.max_score }}" step="0.5"',
        '                         style="width:100%;accent-color:var(--accent);cursor:pointer;"',
        '                         ng-model="vm.criteriaScores[crit.key]"',
        '                         ng-change="vm.calculateTotal()" />',
        '                </div>',
        '              </div>',
        '            </div>',

        // Remarks Section
        '            <div class="form-group mb-2">',
        '              <div class="flex-between mb-1">',
        '                <label class="form-label" style="font-size:0.82rem;font-weight:700;margin-bottom:0;">',
        '                  Judge Remarks &amp; Qualitative Commentary',
        '                </label>',
        '                <span class="muted" style="font-size:0.72rem;">Visible in official round tally</span>',
        '              </div>',
        '              <textarea class="form-control" rows="3" ng-model="vm.remarks"',
        '                        placeholder="Write actionable feedback, technique evaluation, strengths, and critique for the contestant..."></textarea>',
        '            </div>',

        // Quick Tag Chips
        '            <div class="quick-tags mb-3" style="display:flex;flex-wrap:wrap;gap:4px;">',
        '              <span class="muted" style="font-size:0.72rem;align-self:center;margin-right:2px;">Quick tags:</span>',
        '              <button type="button" class="btn btn-xs btn-ghost" ng-repeat="tag in vm.quickTags"',
        '                      style="padding:2px 8px;font-size:0.72rem;background:var(--bg-subtle);border:1px solid var(--border);border-radius:12px;"',
        '                      ng-click="vm.appendRemarkTag(tag)">',
        '                {{ tag }}',
        '              </button>',
        '            </div>',

        // Actions
        '            <div class="flex-between gap-2" style="border-top:1px solid var(--border);padding-top:14px;">',
        '              <div class="checkbox-row" style="margin:0;font-size:0.82rem;">',
        '                <input type="checkbox" id="chkFinal" ng-model="vm.isFinal" />',
        '                <label for="chkFinal" style="margin:0;">Submit as Official Final Score</label>',
        '              </div>',
        '              <div class="flex-row gap-2">',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.nextNominee()" title="Skip to next contestant">',
        '                  <span>Next</span><th-icon name="arrow-right" size="13"></th-icon>',
        '                </button>',
        '                <button type="submit" class="btn btn-sm btn-primary" ng-disabled="vm.isSubmitting" style="font-weight:700;padding:6px 18px;">',
        '                  <th-icon name="check" size="14"></th-icon>',
        '                  <span>{{ vm.isSubmitting ? "Saving..." : "Submit Score (" + vm.totalScore + "%)" }}</span>',
        '                </button>',
        '              </div>',
        '            </div>',
        '          </form>',
        '        </div>',
        '      </div>',
        '    </div>',

        // ---------------------------------------------------------------------
        // TAB 2: MASTER TALLY SCORE SHEET
        // ---------------------------------------------------------------------
        '    <div ng-if="vm.activeTab === \'tally\'">',
        '      <div class="card mb-3 tally-sheet-card">',

        // Tally Header & Actions
        '        <div class="flex-between flex-wrap gap-2 mb-3">',
        '          <div>',
        '            <h2 style="margin:0;font-size:1.3rem;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="clipboard-check" size="20" style="color:var(--accent);"></th-icon>',
        '              <span>Master Tally Score Sheet &bull; {{ vm.tallyData.round.name || "Round Standings" }}</span>',
        '            </h2>',
        '            <p class="muted" style="margin:2px 0 0 0;font-size:0.85rem;">',
        '              Consolidated scores from all participating judges, criteria breakdown, and round rankings over 100%.',
        '            </p>',
        '          </div>',
        '          <div class="flex-row gap-2">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadTally()">',
        '              <th-icon name="refresh" size="14"></th-icon><span>Refresh</span>',
        '            </button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.printTally()">',
        '              <th-icon name="printer" size="14"></th-icon><span>Print</span>',
        '            </button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.exportTallyCsv()">',
        '              <th-icon name="download" size="14"></th-icon><span>Export CSV</span>',
        '            </button>',
        '            <button type="button" class="btn btn-sm btn-primary" ng-if="vm.perms.canManageCompetition()" ng-disabled="vm.isSyncing" ng-click="vm.syncTally()" title="Sync all consensus scores into round entries">',
        '              <th-icon name="check" size="14"></th-icon>',
        '              <span>{{ vm.isSyncing ? "Syncing..." : "Sync Consensus Scores" }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',

        // Summary KPI Bar
        '        <div class="grid-4 gap-2 mb-3" ng-if="vm.tallyData.summary">',
        '          <div class="kpi-card" style="padding:10px 14px;">',
        '            <div class="kpi-label">Nominees in Round</div>',
        '            <div class="kpi-value" style="font-size:1.4rem;">{{ vm.tallyData.summary.total_nominees }}</div>',
        '          </div>',
        '          <div class="kpi-card" style="padding:10px 14px;">',
        '            <div class="kpi-label">Judges Participating</div>',
        '            <div class="kpi-value" style="font-size:1.4rem;">{{ vm.tallyData.summary.total_judges }}</div>',
        '          </div>',
        '          <div class="kpi-card" style="padding:10px 14px;">',
        '            <div class="kpi-label">Total Scorecards</div>',
        '            <div class="kpi-value" style="font-size:1.4rem;">{{ vm.tallyData.summary.total_scorecards }}</div>',
        '          </div>',
        '          <div class="kpi-card" style="padding:10px 14px;">',
        '            <div class="kpi-label">Round Avg Score</div>',
        '            <div class="kpi-value" style="font-size:1.4rem;color:var(--accent);">{{ vm.tallyData.summary.average_round_score }}%</div>',
        '          </div>',
        '        </div>',

        // Master Matrix Table
        '        <div class="table-responsive mb-2">',
        '          <table class="data-table" style="width:100%;font-size:0.86rem;">',
        '            <thead>',
        '              <tr>',
        '                <th style="width:60px;">Rank</th>',
        '                <th>Nominee</th>',
        '                <th>Category</th>',
        // Dynamic Column for each judge
        '                <th ng-repeat="j in vm.tallyData.judges" style="text-align:center;">',
        '                  <div style="font-size:0.82rem;font-weight:700;">{{ j.name }}</div>',
        '                  <div class="muted" style="font-size:0.7rem;font-weight:400;">Judge</div>',
        '                </th>',
        '                <th style="text-align:center;">Criteria Averages</th>',
        '                <th style="text-align:right;">Consensus Score</th>',
        '                <th style="text-align:center;">Remarks</th>',
        '              </tr>',
        '            </thead>',
        '            <tbody>',
        '              <tr ng-repeat="row in vm.tallyData.nominees">',
        '                <td>',
        '                  <span class="badge" ng-class="row.rank === 1 ? \'badge-gold\' : (row.rank === 2 ? \'badge-primary\' : (row.rank === 3 ? \'badge-success\' : \'badge-subtle\'))" style="font-weight:800;">',
        '                    #{{ row.rank }}',
        '                  </span>',
        '                </td>',
        '                <td>',
        '                  <div style="display:flex;align-items:center;gap:8px;">',
        '                    <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-subtle);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;overflow:hidden;flex-shrink:0;">',
        '                      <img ng-if="row.profile_image && row.profile_image.public_url" ng-src="{{ row.profile_image.public_url }}" style="width:100%;height:100%;object-fit:cover;" alt="" />',
        '                      <span ng-if="!row.profile_image || !row.profile_image.public_url">{{ row.public_name | initials }}</span>',
        '                    </div>',
        '                    <div>',
        '                      <strong>{{ row.public_name }}</strong>',
        '                      <div class="muted" style="font-size:0.75rem;">Status: {{ row.status }}</div>',
        '                    </div>',
        '                  </div>',
        '                </td>',
        '                <td>{{ row.category_name }}</td>',

        // Judge scores
        '                <td ng-repeat="j in vm.tallyData.judges" style="text-align:center;">',
        '                  <span ng-if="row.judge_scores[j.id]" class="badge" ng-class="vm.getScoreBadgeClass(row.judge_scores[j.id].total_score)" style="font-size:0.8rem;font-weight:700;" title="Technical: {{ row.judge_scores[j.id].criteria_scores.technical }} | Stage: {{ row.judge_scores[j.id].criteria_scores.stage_presence }} | Creativity: {{ row.judge_scores[j.id].criteria_scores.creativity }} | Overall: {{ row.judge_scores[j.id].criteria_scores.overall }}">',
        '                    {{ row.judge_scores[j.id].total_score }}%',
        '                  </span>',
        '                  <span ng-if="!row.judge_scores[j.id]" class="muted">&mdash;</span>',
        '                </td>',

        // Criteria averages
        '                <td style="text-align:center;font-size:0.78rem;">',
        '                  <span title="Technical">Tech: <strong>{{ row.criteria_averages.technical || 0 }}</strong></span> &bull; ',
        '                  <span title="Stage Presence">Stage: <strong>{{ row.criteria_averages.stage_presence || 0 }}</strong></span> &bull; ',
        '                  <span title="Creativity">Orig: <strong>{{ row.criteria_averages.creativity || 0 }}</strong></span>',
        '                </td>',

        // Consensus Total %
        '                <td style="text-align:right;">',
        '                  <span style="font-size:1.15rem;font-weight:900;color:var(--accent);">',
        '                    {{ row.consensus_score }}%',
        '                  </span>',
        '                  <div class="muted" style="font-size:0.72rem;">{{ row.judge_count }} judge(s)</div>',
        '                </td>',

        // Remarks Button
        '                <td style="text-align:center;">',
        '                  <button type="button" class="btn btn-xs btn-secondary" ng-click="vm.openRemarksModal(row)" title="View Judge Feedback">',
        '                    <th-icon name="clipboard-check" size="13"></th-icon>',
        '                    <span>Feedback ({{ (row.remarks || []).length }})</span>',
        '                  </button>',
        '                </td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',

        '        <div class="muted" style="font-size:0.78rem;margin-top:8px;">',
        '          * Consensus Score is the calculated average of all participating judges\' official scorecards over 100%. Synchronizing updates <code>RoundEntry.judge_score</code> and feeds directly into composite elimination calculations.',
        '        </div>',
        '      </div>',
        '    </div>',

        // ---------------------------------------------------------------------
        // MODAL: VIEW ALL JUDGE REMARKS FOR A NOMINEE
        // ---------------------------------------------------------------------
        '    <div class="modal-backdrop" ng-if="vm.selectedRemarksNominee" ng-click="vm.closeRemarksModal()" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">',
        '      <div class="card" ng-click="$event.stopPropagation()" style="max-width:550px;width:100%;max-height:85vh;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">',
        '        <div class="flex-between mb-3">',
        '          <div>',
        '            <h3 style="margin:0;font-size:1.2rem;">Judge Remarks &amp; Feedback</h3>',
        '            <div class="muted" style="font-size:0.85rem;">{{ vm.selectedRemarksNominee.public_name }} &bull; Consensus: {{ vm.selectedRemarksNominee.consensus_score }}%</div>',
        '          </div>',
        '          <button type="button" class="btn btn-xs btn-ghost" ng-click="vm.closeRemarksModal()"><th-icon name="x" size="16"></th-icon></button>',
        '        </div>',

        '        <div ng-if="(!vm.selectedRemarksNominee.remarks || vm.selectedRemarksNominee.remarks.length === 0)" class="text-center muted" style="padding:24px;">',
        '          No written remarks recorded for this nominee yet.',
        '        </div>',

        '        <div class="remarks-list" ng-if="vm.selectedRemarksNominee.remarks.length > 0">',
        '          <div class="remark-item mb-2" ng-repeat="rem in vm.selectedRemarksNominee.remarks" style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:6px;padding:12px;">',
        '            <div class="flex-between mb-1">',
        '              <strong style="font-size:0.88rem;color:var(--text);">{{ rem.judge_name }}</strong>',
        '              <span class="badge" ng-class="vm.getScoreBadgeClass(rem.score)">{{ rem.score }}%</span>',
        '            </div>',
        '            <p style="margin:0;font-size:0.85rem;line-height:1.4;color:var(--text-muted);font-style:italic;">',
        '              &ldquo;{{ rem.remarks }}&rdquo;',
        '            </p>',
        '            <div class="muted text-right" style="font-size:0.72rem;margin-top:4px;">{{ rem.created_at | date:"medium" }}</div>',
        '          </div>',
        '        </div>',

        '        <div class="text-right mt-3">',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.closeRemarksModal()">Close</button>',
        '        </div>',
        '      </div>',
        '    </div>',

        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
