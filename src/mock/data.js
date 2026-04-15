export const detectionFeed = [
  {
    id: "D-01",
    labelKey: "person",
    label: "受困人员",
    score: 0.94,
    bbox: [18, 28, 16, 24],
    timestamp: "14:31:08",
  },
  {
    id: "D-02",
    labelKey: "vehicle",
    label: "异常车辆",
    score: 0.88,
    bbox: [56, 44, 20, 12],
    timestamp: "14:31:08",
  },
  {
    id: "D-03",
    labelKey: "facility",
    label: "设施破损",
    score: 0.79,
    bbox: [72, 18, 14, 18],
    timestamp: "14:31:09",
  },
  {
    id: "D-04",
    labelKey: "animal",
    label: "珍稀动物",
    score: 0.84,
    bbox: [34, 62, 12, 16],
    timestamp: "14:31:10",
  },
];

export const metricsSummary = {
  precision: 91.6,
  recall: 88.2,
  map50: 82.4,
  map75: 74.8,
  map5095: 68.3,
  f1: 89.8,
  fps: 27.8,
  latency: 36,
  jitter: 4.6,
  throughput: 946,
  missRate: 4.4,
  stability: 97.2,
  totalFrames: 28450,
  totalTargets: 9623,
  activeTargets: 4,
  avgScore: 86.2,
  avgInference: 28.9,
};

export const metricSeries = {
  classes: [
    {
      name: "人员",
      value: 89,
      precision: 93.2,
      recall: 90.4,
      f1: 91.8,
      support: 3128,
      missRate: 3.7,

    },
    {
      name: "车辆",
      value: 84,
      precision: 89.1,
      recall: 86.3,
      f1: 87.7,
      support: 2760,
      missRate: 5.8,

    },
    {
      name: "动物",
      value: 81,
      precision: 85.6,
      recall: 82.1,
      f1: 83.8,
      support: 1846,
      missRate: 7.3,

    },
    {
      name: "设施",
      value: 76,
      precision: 82.4,
      recall: 78.6,
      f1: 80.5,
      support: 1889,
      missRate: 9.2,
    },
  ],
  sceneComparison: [
    {
      scene: "城市",
      precision: 93,
      recall: 87,
      map50: 86.7,
      fps: 30.2,
      latency: 31,

      samples: 4680,
    },
    {
      scene: "农田",
      precision: 90,
      recall: 89,
      map50: 84.9,
      fps: 28.4,
      latency: 35,

      samples: 3820,
    },
    {
      scene: "夜间",
      precision: 81,
      recall: 76,
      map50: 72.3,
      fps: 25.8,
      latency: 42,
      samples: 2610,
    },
    {
      scene: "雨雾",
      precision: 78,
      recall: 73,
      map50: 69.5,
      fps: 24.7,
      latency: 45,
      samples: 2010,
    },
  ],
  prCurve: [
    [0, 0.97],
    [0.1, 0.96],
    [0.2, 0.94],
    [0.3, 0.92],
    [0.4, 0.9],
    [0.5, 0.88],
    [0.6, 0.85],
    [0.7, 0.81],
    [0.8, 0.75],
    [0.9, 0.68],
    [1, 0.62],
  ],
  iouMetrics: [
    { iou: "0.50", map: 82.4, precision: 91.6, recall: 88.2 },
    { iou: "0.55", map: 80.6, precision: 90.8, recall: 87.4 },
    { iou: "0.60", map: 78.1, precision: 89.7, recall: 85.9 },
    { iou: "0.65", map: 75.3, precision: 88.1, recall: 84.2 },
    { iou: "0.70", map: 72.2, precision: 86.5, recall: 82.1 },
    { iou: "0.75", map: 68.4, precision: 84.2, recall: 79.6 },
    { iou: "0.80", map: 63.8, precision: 82.0, recall: 76.8 },
    { iou: "0.85", map: 58.2, precision: 79.5, recall: 73.1 },
    { iou: "0.90", map: 51.6, precision: 76.3, recall: 68.4 },
    { iou: "0.95", map: 42.1, precision: 72.8, recall: 62.5 },
  ],
  fpsTrend: [
    25.8, 26.4, 27.1, 27.8, 28.3, 27.6, 28.1, 29.0, 28.7, 27.9, 28.4, 28.8,
    27.8, 28.2, 29.1, 28.5, 27.4, 28.0, 28.6, 27.3,
  ],
  latencyTrend: [
    41, 39, 37, 36, 34, 35, 33, 32, 34, 35, 33, 32,
    36, 34, 31, 33, 37, 35, 33, 38,
  ],
  confidenceBands: [
    { threshold: 0.30, precision: 79.5, recall: 95.8, f1: 86.9 },
    { threshold: 0.35, precision: 82.1, recall: 94.2, f1: 87.7 },
    { threshold: 0.40, precision: 84.6, recall: 93.5, f1: 88.8 },
    { threshold: 0.45, precision: 86.8, recall: 92.7, f1: 89.6 },
    { threshold: 0.50, precision: 88.4, recall: 91.3, f1: 89.8 },
    { threshold: 0.55, precision: 90.1, recall: 89.8, f1: 89.9 },
    { threshold: 0.60, precision: 91.5, recall: 87.6, f1: 89.5 },
    { threshold: 0.65, precision: 92.6, recall: 85.2, f1: 88.8 },
    { threshold: 0.70, precision: 93.8, recall: 82.1, f1: 87.6 },
    { threshold: 0.75, precision: 95.4, recall: 77.6, f1: 85.6 },
    { threshold: 0.80, precision: 96.5, recall: 72.3, f1: 82.7 },
    { threshold: 0.85, precision: 97.2, recall: 65.8, f1: 78.5 },
  ],
  hourlyQuality: [
    { period: "06:00-07:00", targets: 324, avgScore: 82.3, map50: 78.1 },
    { period: "07:00-08:00", targets: 518, avgScore: 84.6, map50: 80.4 },
    { period: "08:00-09:00", targets: 692, avgScore: 86.2, map50: 82.1 },
    { period: "09:00-10:00", targets: 812, avgScore: 87.1, map50: 83.6 },
    { period: "10:00-11:00", targets: 954, avgScore: 88.5, map50: 84.1 },
    { period: "11:00-12:00", targets: 1022, avgScore: 86.9, map50: 82.8 },
    { period: "12:00-13:00", targets: 738, avgScore: 85.4, map50: 81.2 },
    { period: "13:00-14:00", targets: 1108, avgScore: 87.8, map50: 83.9 },
    { period: "14:00-15:00", targets: 1236, avgScore: 88.2, map50: 84.5 },
    { period: "15:00-16:00", targets: 1085, avgScore: 87.5, map50: 83.2 },
    { period: "16:00-17:00", targets: 946, avgScore: 86.8, map50: 82.6 },
    { period: "17:00-18:00", targets: 672, avgScore: 84.9, map50: 80.8 },
  ],
};

export const taskList = [
  {
    id: "T-240311-01",
    name: "秦岭林区搜救巡检",
    scene: "山地",
    source: "drone-cam-01",
    createdAt: "2026-03-11 14:31",
    targetCount: 18,

    fps: 28.1,
    map50: 83.1,
    status: "running",
  },
  {
    id: "T-240311-02",
    name: "城市高架交通监测",
    scene: "城市",
    source: "video-demo-02",
    createdAt: "2026-03-11 11:08",
    targetCount: 42,

    fps: 30.4,
    map50: 85.7,
    status: "finished",
  },
  {
    id: "T-240310-07",
    name: "农田病虫害识别",
    scene: "农田",
    source: "video-demo-03",
    createdAt: "2026-03-10 17:20",
    targetCount: 26,

    fps: 26.2,
    map50: 80.8,
    status: "finished",
  },
];

export const systemResources = {
  cpu: 32,
  gpu: 68,
  memory: 45,
  disk: 25,
  temp: 58,
  network: { up: "2.4 MB/s", down: "5.1 MB/s" },
};

export const loginHistory = [
  { id: 1, time: '2026-03-13 14:30:00', ip: '192.168.1.101', location: '西安 (本机)', status: 'success' },
  { id: 2, time: '2026-03-13 09:15:22', ip: '192.168.1.105', location: '西安', status: 'success' },
  { id: 3, time: '2026-03-12 18:45:10', ip: '10.0.0.5', location: '内网', status: 'success' },
  { id: 4, time: '2026-03-12 11:20:33', ip: '192.168.1.200', location: '未知设备', status: 'failed' },
];

export const deviceList = [
  { id: 'dev-01', name: 'Control Station Alpha', type: 'Desktop', lastActive: 'Current Session' },
  { id: 'dev-02', name: 'Field Tablet X1', type: 'Mobile', lastActive: '2 hours ago' },
  { id: 'dev-03', name: 'Backup Server', type: 'Server', lastActive: '1 day ago' },
];

export const systemLogs = [
  { id: 101, time: '14:32:05', level: 'info', message: 'System self-check completed' },
  { id: 102, time: '14:31:08', level: 'warning', message: 'High CPU usage detected (85%)' },
  { id: 103, time: '14:30:45', level: 'success', message: 'Model weights loaded successfully' },
  { id: 104, time: '14:30:10', level: 'error', message: 'Failed to sync with cloud storage' },
];
