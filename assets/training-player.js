(function () {
    'use strict';

    const video = document.getElementById('trainingVideo');
    const preview = document.getElementById('previewButton');
    const status = document.getElementById('videoMessage');
    const statusText = document.getElementById('messageText');
    const retry = document.getElementById('retryButton');
    const directLink = document.getElementById('directVideoLink');
    if (!video || !preview || !status || !statusText || !retry || !directLink) return;

    let requested = false;
    let hasPlayed = false;
    let phase = 'idle';
    let generation = 0;
    let pendingPlay = false;
    let savedPosition = null;
    let waitTimer = null;

    video.tabIndex = 0;

    function clearWaitTimer() {
        if (waitTimer !== null) clearTimeout(waitTimer);
        waitTimer = null;
    }

    function hideStatus() {
        clearWaitTimer();
        if (document.activeElement === retry || document.activeElement === directLink) focusVideo();
        status.hidden = true;
        retry.hidden = true;
        directLink.hidden = true;
    }

    function showWaiting(nextPhase) {
        // Repeated waiting/stalled events must not restart the recovery timer.
        if (phase === nextPhase && !status.hidden) return;
        clearWaitTimer();
        phase = nextPhase;
        statusText.textContent = nextPhase === 'buffering'
            ? 'Buffering video...'
            : 'Loading video...';
        retry.hidden = true;
        directLink.hidden = true;
        status.hidden = false;
        waitTimer = setTimeout(function () {
            waitTimer = null;
            if (requested && !video.ended && (pendingPlay || !video.paused) &&
                (phase === 'loading' || phase === 'buffering')) {
                statusText.textContent = 'Taking longer than expected. You can reload the video.';
                retry.hidden = false;
                directLink.hidden = false;
            }
        }, 15000);
    }

    function showError() {
        clearWaitTimer();
        pendingPlay = false;
        phase = 'error';
        statusText.textContent = 'Unable to load this video. Please try again.';
        retry.hidden = false;
        directLink.hidden = false;
        status.hidden = false;
    }

    function finishPlaying() {
        hasPlayed = true;
        pendingPlay = false;
        phase = 'playing';
        preview.hidden = true;
        hideStatus();
    }

    function focusVideo() {
        try { video.focus({ preventScroll: true }); }
        catch (error) { video.focus(); }
    }

    function startVideo() {
        requested = true;
        pendingPlay = true;
        const attempt = ++generation;
        preview.hidden = true;
        showWaiting('loading');
        focusVideo();
        try {
            // Keep play() in the click handler so mobile browsers retain the
            // user's playback permission, including when retrying a request.
            const request = video.play();
            if (request && typeof request.then === 'function') {
                request.then(function () {
                    if (attempt !== generation) return;
                    pendingPlay = false;
                    if (!video.paused && !video.seeking && video.readyState >= 3) finishPlaying();
                }).catch(function () {
                    if (attempt === generation) showError();
                });
            }
        } catch (error) {
            if (attempt === generation) showError();
        }
    }

    preview.addEventListener('click', startVideo);

    retry.addEventListener('click', function () {
        // load() resets the media timeline. Restore it once metadata returns.
        if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
            savedPosition = video.currentTime;
        }
        ++generation;
        pendingPlay = false;
        clearWaitTimer();
        phase = 'idle';
        video.load();
        startVideo();
    });

    video.addEventListener('loadedmetadata', function () {
        if (savedPosition === null) return;
        const target = Number.isFinite(video.duration)
            ? Math.min(savedPosition, Math.max(0, video.duration - 0.05))
            : savedPosition;
        savedPosition = null;
        try { video.currentTime = target; }
        catch (error) { /* A non-seekable video can still restart normally. */ }
    });

    video.addEventListener('play', function () {
        requested = true;
        if (video.readyState < 3) showWaiting(hasPlayed ? 'buffering' : 'loading');
    });

    video.addEventListener('playing', finishPlaying);

    video.addEventListener('waiting', function () {
        if (requested && !video.paused && !video.ended && phase !== 'error') {
            showWaiting(hasPlayed ? 'buffering' : 'loading');
        }
    });

    video.addEventListener('stalled', function () {
        // A stalled preload request is harmless if the video has enough data.
        if (requested && !video.paused && !video.ended && video.readyState < 3 && phase !== 'error') {
            showWaiting(hasPlayed ? 'buffering' : 'loading');
        }
    });

    video.addEventListener('pause', function () {
        if (!video.paused || phase === 'error') return;
        ++generation;
        pendingPlay = false;
        phase = 'paused';
        hideStatus();
    });

    video.addEventListener('seeking', function () {
        if (requested && !video.paused && phase !== 'error') showWaiting('buffering');
    });

    video.addEventListener('seeked', function () {
        if (phase === 'error') return;
        if (video.paused) hideStatus();
        else if (video.readyState >= 3) finishPlaying();
    });

    video.addEventListener('ended', function () {
        ++generation;
        pendingPlay = false;
        phase = 'ended';
        hideStatus();
    });

    video.addEventListener('error', function () {
        if (requested) {
            ++generation;
            showError();
        }
    });
})();
