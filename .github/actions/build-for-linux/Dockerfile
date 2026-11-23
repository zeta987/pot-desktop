FROM rust:bullseye

# Debian 11 (bullseye) reached LTS EOL in August 2026 and its security packages were
# moved off deb.debian.org onto archive.debian.org. Keep bullseye (glibc 2.31) so
# Linux AppImage/deb/rpm binaries stay compatible with older distributions, and point
# apt at the Debian archive with Check-Valid-Until disabled for archived Release files.
ENV DEBIAN_FRONTEND=noninteractive
RUN printf '%s\n' \
        'deb http://archive.debian.org/debian bullseye main' \
        'deb http://archive.debian.org/debian-security bullseye-security main' \
        'deb http://archive.debian.org/debian bullseye-updates main' \
        > /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99archive

COPY entrypoint.sh /entrypoint.sh
RUN chmod a+x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
