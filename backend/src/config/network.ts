import net from 'node:net'

// Node tries a host's IPv4 and IPv6 addresses in turn, giving each 250 ms by default.
// Hosts far away (Project Gutenberg in the US is ~270 ms from South Asia) don't connect
// in that time, so Node gives up on IPv4 and waits on IPv6, which many networks can't
// reach: the request times out. A second per attempt still falls back quickly.
net.setDefaultAutoSelectFamilyAttemptTimeout(1000)
