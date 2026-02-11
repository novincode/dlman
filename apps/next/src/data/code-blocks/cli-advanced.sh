# Queue management
dlman queue list
dlman queue create "Videos" --color "#3b82f6" --max-concurrent 3
dlman queue start <queue-id>

# Batch import
dlman add url1 url2 url3 -q <queue-id>

# Probe URLs for file info
dlman probe https://example.com/file1.zip https://example.com/file2.zip