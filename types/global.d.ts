declare global {
  var twipclipJobs: Map<string, any> | undefined;
  var twipclipCleanupTimeouts: Map<string, NodeJS.Timeout> | undefined;
}

export {}; 