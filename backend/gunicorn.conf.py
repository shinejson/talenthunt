import multiprocessing
import os

# ==============================================================================
# StageLight Ghana Talent Hunt — Production Gunicorn WSGI Configuration
# ==============================================================================

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '5050')}"
backlog = 2048

# Worker processes & threading
# Rule of thumb: (2 x num_cores) + 1 workers, each with thread pool
cpu_cores = multiprocessing.cpu_count()
workers = int(os.environ.get("WEB_CONCURRENCY", min(4, max(2, cpu_cores))))
worker_class = "gthread"
threads = int(os.environ.get("PYTHON_GETHREAD_THREADS", "4"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))

# Memory leak defense: recycle workers after servicing N requests
max_requests = 1000
max_requests_jitter = 100

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" (%(D)s µs)'

# Process naming
proc_name = "stagelight-wsgi"

# Server mechanics
daemon = False
preload_app = False
