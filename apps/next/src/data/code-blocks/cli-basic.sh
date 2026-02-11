# Basic download
dlman add https://example.com/file.zip

# Custom output folder and 8 segments
dlman add https://example.com/file.zip -o ~/Downloads -s 8

# List all downloads
dlman list

# Pause / Resume
dlman pause <id>
dlman resume <id>

# See all options
dlman --help