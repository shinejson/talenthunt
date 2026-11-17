import logging
import os
import signal
import sys
import time

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
from app.tasks.jobs import reconcile_all_pending_payments

logger = logging.getLogger("stagelight.worker")

running = True


def handle_shutdown(signum, frame):
    global running
    logger.info("Received termination signal (%s). Shutting down background worker gracefully...", signum)
    running = False


def main():
    global running
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    app = create_app()
    interval = int(os.environ.get("RECONCILIATION_INTERVAL_SECONDS", "60"))

    logger.info("StageLight Background Task Worker started (poll interval: %d seconds).", interval)

    with app.app_context():
        while running:
            try:
                summary = reconcile_all_pending_payments()
                if summary["checked"] > 0:
                    logger.info("Payment reconciliation run: %s", summary)
            except Exception as e:
                logger.exception("Error occurred during background payment reconciliation: %s", e)

            # Sleep in 1-second chunks to respond immediately to SIGINT/SIGTERM
            for _ in range(interval):
                if not running:
                    break
                time.sleep(1)

    logger.info("StageLight Background Task Worker stopped.")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )
    main()
