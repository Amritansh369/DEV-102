/** Demo dataset for the seed (deterministic, so every reseed produces the same rows). */
import type {
  BrowsingLog,
  Candidate,
  Exam,
  Question,
  Session,
  Severity,
  Violation,
  ViolationCode,
} from '../../apps/web/src/lib/types';

export const NOW = Date.now();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Deterministic PRNG so the seed data is identical on server and client renders. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const between = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
const iso = (t: number): string => new Date(t).toISOString();
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/* ---------------------------------------------------------------- violations meta */

export const VIOLATION_META: Record<ViolationCode, { label: string; severity: Severity; message: string }> = {
  MULTIPLE_FACES: { label: 'Multiple faces', severity: 'HIGH', message: 'More than one face detected in the webcam frame' },
  NO_FACE: { label: 'Face not visible', severity: 'MEDIUM', message: 'No face detected for more than 8 seconds' },
  GAZE_AWAY: { label: 'Looking away', severity: 'LOW', message: 'Gaze held away from the screen for 6 seconds' },
  FACE_MISMATCH: { label: 'Face mismatch', severity: 'CRITICAL', message: 'Live face does not match the verified candidate photo' },
  AI_SITE_OPENED: { label: 'AI site opened', severity: 'HIGH', message: 'Candidate opened a known AI assistant website' },
  AI_QUERY_DETECTED: { label: 'AI query detected', severity: 'CRITICAL', message: 'A question-like prompt was typed into an AI chat' },
  BLACKLISTED_APP: { label: 'Blacklisted app', severity: 'HIGH', message: 'A blacklisted application started during the exam' },
  SCREEN_MIRRORING: { label: 'Screen mirroring', severity: 'HIGH', message: 'Display mirroring or casting was detected' },
  MULTI_MONITOR: { label: 'Extra monitor', severity: 'HIGH', message: 'A second display was connected' },
  VM_DETECTED: { label: 'Virtual machine', severity: 'CRITICAL', message: 'The exam is running inside a virtual machine' },
  REMOTE_DESKTOP: { label: 'Remote desktop', severity: 'CRITICAL', message: 'A remote desktop session is controlling this device' },
  EXTERNAL_DEVICE: { label: 'External device', severity: 'MEDIUM', message: 'A new USB or Bluetooth device was attached' },
  CLIPBOARD_USE: { label: 'Clipboard use', severity: 'MEDIUM', message: 'Copy or paste attempt was blocked' },
  SHORTCUT_BLOCKED: { label: 'Shortcut blocked', severity: 'LOW', message: 'A restricted keyboard shortcut was blocked' },
  SCREEN_SHARE_STOPPED: { label: 'Screen share stopped', severity: 'HIGH', message: 'Entire-screen sharing was stopped by the candidate' },
  CAMERA_BLOCKED: { label: 'Camera blocked', severity: 'HIGH', message: 'The webcam feed is covered or disabled' },
  MULTI_LOGIN: { label: 'Multiple logins', severity: 'CRITICAL', message: 'The same credentials were used on another device' },
  NETWORK_LOST: { label: 'Network lost', severity: 'LOW', message: 'Connection dropped; answers are cached locally' },
  WINDOW_BLUR: { label: 'Window lost focus', severity: 'MEDIUM', message: 'The exam window lost focus' },
  VOICE_DETECTED: { label: 'Voice detected', severity: 'MEDIUM', message: 'Speech was picked up by the microphone for several seconds' },
  MIC_BLOCKED: { label: 'Microphone blocked', severity: 'HIGH', message: 'The microphone is muted, disconnected or silent' },
  PHONE_DETECTED: { label: 'Phone detected', severity: 'HIGH', message: 'A mobile phone was visible in the webcam frame' },
  NOTES_DETECTED: { label: 'Notes detected', severity: 'MEDIUM', message: 'A book or notes were visible in the webcam frame' },
};

export const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 3, MEDIUM: 8, HIGH: 15, CRITICAL: 30 };

export function computeRisk(vs: ReadonlyArray<Pick<Violation, 'severity' | 'reviewed'>>): number {
  const total = vs.reduce((sum, v) => (v.reviewed === 'OVERRULED' ? sum : sum + SEVERITY_WEIGHT[v.severity]), 0);
  return Math.min(100, total);
}

const EVIDENCE_CODES: ViolationCode[] = ['MULTIPLE_FACES', 'NO_FACE', 'FACE_MISMATCH', 'CAMERA_BLOCKED'];
let violationSeq = 0;

export function makeViolation(sessionId: string, code: ViolationCode, at: number): Violation {
  violationSeq += 1;
  const id = `vio_${String(violationSeq).padStart(4, '0')}`;
  const meta = VIOLATION_META[code];
  return {
    id,
    sessionId,
    code,
    severity: meta.severity,
    at: iso(at),
    message: meta.message,
    ...(EVIDENCE_CODES.includes(code) ? { evidenceUrl: `/images/evidence/${id}.jpg` } : {}),
  };
}

/* ---------------------------------------------------------------- exams */

type ExamSeed = Omit<Exam, 'totalMarks' | 'questionCount' | 'candidateCount'>;

const settings = (over: Partial<Exam['settings']> = {}): Exam['settings'] => ({
  shuffle: true,
  negativeMarking: false,
  allowedSites: [],
  maxWarnings: 3,
  autoSubmit: true,
  audioMonitoring: false,
  ...over,
});

const EXAM_SEEDS: ExamSeed[] = [
  {
    id: 'exm_01', title: 'Campus Placement Aptitude Test 2026', code: 'CPA-26', status: 'LIVE',
    startsAt: iso(NOW - 35 * MIN), endsAt: iso(NOW + 25 * MIN), durationMin: 60,
    settings: settings({ negativeMarking: true }),
  },
  {
    id: 'exm_02', title: 'Data Structures & Algorithms Mid-Term', code: 'DSA-MT', status: 'LIVE',
    startsAt: iso(NOW - 50 * MIN), endsAt: iso(NOW + 40 * MIN), durationMin: 90,
    settings: settings({ allowedSites: ['visualgo.net', 'cppreference.com'], maxWarnings: 4 }),
  },
  {
    id: 'exm_03', title: 'Cloud & DevOps Fundamentals Certification', code: 'CDF-01', status: 'SCHEDULED',
    startsAt: iso(NOW + 2 * DAY), endsAt: iso(NOW + 2 * DAY + 75 * MIN), durationMin: 75,
    settings: settings({ allowedSites: ['docs.docker.com', 'kubernetes.io'] }),
  },
  {
    id: 'exm_04', title: 'Python Programming Assessment', code: 'PYT-SEP', status: 'COMPLETED',
    startsAt: iso(NOW - 9 * DAY), endsAt: iso(NOW - 9 * DAY + 45 * MIN), durationMin: 45,
    settings: settings({ allowedSites: ['docs.python.org'] }),
  },
  {
    id: 'exm_05', title: 'DBMS & SQL Screening Round', code: 'DBM-02', status: 'COMPLETED',
    startsAt: iso(NOW - 3 * DAY), endsAt: iso(NOW - 3 * DAY + 60 * MIN), durationMin: 60,
    settings: settings({ negativeMarking: true, maxWarnings: 2 }),
  },
  {
    id: 'exm_06', title: 'Cyber Security Awareness Quiz', code: 'CSA-DRAFT', status: 'DRAFT',
    startsAt: iso(NOW + 10 * DAY), endsAt: iso(NOW + 10 * DAY + 30 * MIN), durationMin: 30,
    settings: settings({ shuffle: false, autoSubmit: false }),
  },
];

/* ---------------------------------------------------------------- questions */

type Diff = 'E' | 'M' | 'H';
/** [text, options, correct index or indices, difficulty, tag] */
type QTuple = [string, string[], number | number[], Diff, string];

const BANK: Record<string, QTuple[]> = {
  exm_01: [
    ['A train 150 m long passes a pole in 15 seconds. What is its speed in km/h?', ['36', '45', '54', '60'], 0, 'E', 'quant'],
    ['What is the simple interest on ₹8,000 at 5% per annum for 3 years?', ['₹1,000', '₹1,200', '₹1,500', '₹2,400'], 1, 'E', 'quant'],
    ['Find the next number in the series 2, 6, 12, 20, 30, ?', ['40', '42', '44', '46'], 1, 'E', 'logical'],
    ['If 20% of a number is 50, what is the number?', ['100', '200', '250', '300'], 2, 'E', 'quant'],
    ['Pipe A fills a tank in 12 hours and pipe B in 18 hours. Working together, they fill it in:', ['6.8 hours', '7.2 hours', '7.5 hours', '8 hours'], 1, 'M', 'quant'],
    ['Two ages are in the ratio 3:5 and their sum is 64 years. The elder is:', ['24', '32', '40', '48'], 2, 'M', 'quant'],
    ['Choose the synonym of "Meticulous".', ['Careless', 'Thorough', 'Hasty', 'Vague'], 1, 'E', 'verbal'],
    ['Find the odd one out.', ['Mango', 'Banana', 'Potato', 'Apple'], 2, 'E', 'logical'],
    ['Select all prime numbers.', ['21', '29', '31', '39'], [1, 2], 'M', 'quant'],
    ['A shopkeeper marks goods 25% above cost and allows a 10% discount. His profit percentage is:', ['10%', '12.5%', '15%', '20%'], 1, 'M', 'quant'],
    ['What is the average of the first 10 natural numbers?', ['5', '5.5', '6', '10'], 1, 'E', 'quant'],
    ['If CODE is written as DPEF, how is BOOK written?', ['CPPL', 'CPPM', 'CQQL', 'DPPL'], 0, 'M', 'logical'],
    ['Compound interest on ₹10,000 at 10% per annum for 2 years is:', ['₹2,000', '₹2,100', '₹2,200', '₹2,500'], 1, 'M', 'quant'],
    ['Choose the grammatically correct sentence.', ["He don't like tea.", "He doesn't likes tea.", "He doesn't like tea.", 'He not like tea.'], 2, 'E', 'verbal'],
    ['The probability of getting a sum of 7 with two fair dice is:', ['1/6', '1/9', '5/36', '7/36'], 0, 'H', 'quant'],
    ['The HCF of two numbers is 12 and their LCM is 180. If one number is 36, the other is:', ['45', '60', '72', '90'], 1, 'H', 'quant'],
    ['A can finish a job in 10 days and B in 15 days. A starts alone and B joins after 4 days. Total days to finish:', ['6', '7', '7.6', '8'], 2, 'H', 'quant'],
    ['Choose the antonym of "Candid".', ['Frank', 'Evasive', 'Honest', 'Open'], 1, 'M', 'verbal'],
    ['Riya walks 5 km north, 3 km east, then 5 km south. How far is she from the start?', ['3 km', '5 km', '8 km', '13 km'], 0, 'E', 'logical'],
    ['Select all numbers divisible by 6.', ['18', '24', '27', '30'], [0, 1, 3], 'M', 'quant'],
  ],
  exm_02: [
    ['What is the time complexity of binary search on a sorted array?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1, 'E', 'complexity'],
    ['Which data structure follows LIFO order?', ['Queue', 'Stack', 'Min-heap', 'Linked list'], 1, 'E', 'stack-queue'],
    ['What is the worst-case time complexity of quicksort?', ['O(n log n)', 'O(n)', 'O(n²)', 'O(log n)'], 2, 'M', 'sorting'],
    ['An inorder traversal of a binary search tree produces keys in:', ['Random order', 'Descending order', 'Ascending order', 'Level order'], 2, 'E', 'trees'],
    ['Select all stable sorting algorithms.', ['Merge sort', 'Quick sort', 'Insertion sort', 'Heap sort'], [0, 2], 'M', 'sorting'],
    ['Space complexity of BFS on a graph with V vertices is:', ['O(1)', 'O(V)', 'O(V²)', 'O(log V)'], 1, 'M', 'graphs'],
    ['Which data structure is used to implement BFS?', ['Stack', 'Queue', 'Priority queue', 'Trie'], 1, 'E', 'graphs'],
    ['The height of a complete binary tree with n nodes is:', ['O(n)', 'O(log n)', 'O(√n)', 'O(1)'], 1, 'M', 'trees'],
    ['Dijkstra\'s algorithm can produce wrong results when the graph has:', ['Cycles', 'Negative edge weights', 'Undirected edges', 'Dense edges'], 1, 'M', 'graphs'],
    ['Amortized cost of appending to a dynamic array is:', ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'], 2, 'M', 'arrays'],
    ['Minimum number of edges in a connected graph with n vertices:', ['n', 'n − 1', 'n + 1', 'n / 2'], 1, 'E', 'graphs'],
    ['Select all properties that hold for a min-heap.', ['Parent ≤ its children', 'It is a complete binary tree', 'Left child < right child', 'Root is the minimum'], [0, 1, 3], 'H', 'heaps'],
    ['Which techniques resolve hash collisions?', ['Chaining', 'Open addressing', 'Double hashing', 'Bubble sort'], [0, 1, 2], 'E', 'hashing'],
    ['The recurrence T(n) = 2T(n/2) + n solves to:', ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], 1, 'M', 'complexity'],
    ['Which technique detects a cycle in a linked list in O(1) space?', ['Floyd tortoise and hare', 'Binary search', 'Kruskal\'s algorithm', 'Topological sort'], 0, 'M', 'linked-list'],
    ['Topological sorting is defined for:', ['Any graph', 'Directed acyclic graphs', 'Undirected trees only', 'Complete graphs'], 1, 'M', 'graphs'],
    ['A full binary tree has 5 leaves. How many nodes does it have?', ['7', '9', '10', '11'], 1, 'H', 'trees'],
    ['The tightest bound for building a heap from n elements is:', ['O(n log n)', 'O(n)', 'O(log n)', 'O(n²)'], 1, 'H', 'heaps'],
    ['Which traversal uses a queue?', ['Preorder', 'Inorder', 'Level-order', 'Postorder'], 2, 'E', 'trees'],
    ['Select all minimum spanning tree algorithms.', ['Prim', 'Kruskal', 'Dijkstra', 'Bellman-Ford'], [0, 1], 'M', 'graphs'],
  ],
  exm_03: [
    ['Which command lists running Docker containers?', ['docker images', 'docker ps', 'docker run', 'docker build'], 1, 'E', 'docker'],
    ['What is the smallest deployable unit in Kubernetes?', ['Node', 'Pod', 'Service', 'Namespace'], 1, 'E', 'kubernetes'],
    ['In CI/CD, "CI" stands for:', ['Continuous Integration', 'Code Inspection', 'Container Image', 'Cloud Infrastructure'], 0, 'E', 'ci-cd'],
    ['Amazon S3 is a service for:', ['Block storage', 'Object storage', 'Relational databases', 'Message queues'], 1, 'E', 'aws'],
    ['Select all infrastructure-as-code tools.', ['Terraform', 'Ansible', 'Wireshark', 'CloudFormation'], [0, 1, 3], 'M', 'iac'],
    ['Which Dockerfile instruction sets the base image?', ['RUN', 'FROM', 'CMD', 'COPY'], 1, 'E', 'docker'],
    ['Which HTTP status code means "too many requests"?', ['401', '403', '429', '503'], 2, 'M', 'networking'],
    ['Which Kubernetes object gives pods a stable network endpoint?', ['Deployment', 'Service', 'ConfigMap', 'Secret'], 1, 'M', 'kubernetes'],
    ['chmod 755 grants the file owner:', ['Read only', 'Read, write and execute', 'Write only', 'No access'], 1, 'M', 'linux'],
    ['A blue-green deployment means:', ['Two identical environments with traffic switched between them', 'Deploying to all servers at once', 'Releasing to 5% of users first', 'Reverting a commit'], 0, 'M', 'ci-cd'],
    ['Which AWS service runs code without managing servers?', ['EC2', 'Lambda', 'RDS', 'Route 53'], 1, 'E', 'aws'],
    ['Which Git command rewrites and squashes recent commits interactively?', ['git merge', 'git rebase -i', 'git fetch', 'git stash'], 1, 'M', 'git'],
    ['Select all container orchestrators.', ['Kubernetes', 'Docker Swarm', 'Nomad', 'Git'], [0, 1, 2], 'M', 'kubernetes'],
    ['Horizontal scaling means:', ['Using a bigger machine', 'Adding more instances', 'Using a faster disk', 'Adding more RAM'], 1, 'E', 'aws'],
    ['What is the default port of SSH?', ['21', '22', '23', '80'], 1, 'E', 'linux'],
    ['Which pair is commonly used for metrics and dashboards?', ['Prometheus and Grafana', 'Nginx and Redis', 'Jenkins and Maven', 'Kafka and Spark'], 0, 'M', 'monitoring'],
    ['Which Kubernetes object stores sensitive values like passwords?', ['ConfigMap', 'Secret', 'PersistentVolumeClaim', 'Ingress'], 1, 'M', 'kubernetes'],
    ['Idempotent configuration management means:', ['Re-running it yields the same final state', 'It can run only once', 'It always needs a reboot', 'It deletes old state first'], 0, 'H', 'iac'],
    ['The CAP theorem says a distributed store can guarantee at most two of:', ['Consistency, Availability, Partition tolerance', 'Cost, Agility, Performance', 'Cache, API, Proxy', 'Cluster, Access, Policy'], 0, 'H', 'architecture'],
    ['Select all valid load-balancing strategies.', ['Round robin', 'Least connections', 'IP hash', 'Bubble sort'], [0, 1, 2], 'M', 'networking'],
  ],
  exm_04: [
    ['What is the type of the result of 3 / 2 in Python 3?', ['int', 'float', 'str', 'tuple'], 1, 'E', 'basics'],
    ['Which of these types is immutable?', ['list', 'dict', 'tuple', 'set'], 2, 'E', 'basics'],
    ['What does len({1, 2, 2, 3}) return?', ['2', '3', '4', 'It raises an error'], 1, 'E', 'basics'],
    ['Which keyword turns a function into a generator?', ['return', 'yield', 'lambda', 'pass'], 1, 'M', 'functions'],
    ['What is the value of "abc"[::-1]?', ['abc', 'cba', 'bca', 'It raises an error'], 1, 'E', 'basics'],
    ['Select all mutable types.', ['list', 'tuple', 'dict', 'str'], [0, 2], 'E', 'basics'],
    ['What is the difference between "is" and "=="?', ['They are identical', '"is" checks identity, "==" checks equality', '"is" checks equality', '"==" checks identity'], 1, 'M', 'basics'],
    ['A decorator is mainly used to:', ['Declare classes', 'Modify or extend a function\'s behaviour', 'Declare variables', 'Import modules'], 1, 'M', 'functions'],
    ['What does [1, 2, 3][-1] evaluate to?', ['1', '2', '3', 'It raises an error'], 2, 'E', 'basics'],
    ['Which block is used to handle exceptions?', ['try / except', 'catch', 'rescue', 'handle'], 0, 'E', 'basics'],
    ['What is the purpose of __init__ in a class?', ['Destroy the object', 'Initialise a new instance', 'Define a static method', 'Import a module'], 1, 'E', 'oop'],
    ['Average-case time complexity of a dict lookup is:', ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'], 2, 'M', 'stdlib'],
    ['Which expression builds a list of squares for 0 to 4?', ['[x * x for x in range(5)]', '{x * x in range(5)}', 'list(x ^ 2)', 'for x * x in range(5)'], 0, 'E', 'basics'],
    ['In CPython, GIL stands for:', ['Global Interpreter Lock', 'General Input Loop', 'Global Import List', 'Generic Item Lock'], 0, 'M', 'stdlib'],
    ['With def f(a=[]), what happens on repeated calls that append to a?', ['A new list is created every call', 'The same list is shared across calls', 'A syntax error occurs', 'The list is always empty'], 1, 'H', 'functions'],
    ['Which module provides regular expressions?', ['regex', 're', 'rx', 'pattern'], 1, 'E', 'stdlib'],
    ['Select all safe ways to ensure a file gets closed.', ['with open(...) as f', 'try / finally with f.close()', 'Never closing the file', 'contextlib.closing'], [0, 1, 3], 'M', 'stdlib'],
    ['What does bool([]) return?', ['True', 'False', 'None', 'It raises an error'], 1, 'E', 'basics'],
    ['*args collects extra positional arguments as a:', ['dict', 'tuple', 'set', 'string'], 1, 'M', 'functions'],
    ['Python resolves attribute lookup order in multiple inheritance using:', ['Depth-first search', 'C3 linearisation', 'Breadth-first search', 'Random order'], 1, 'H', 'oop'],
  ],
  exm_05: [
    ['Which of these is a DDL statement?', ['SELECT', 'CREATE', 'UPDATE', 'DELETE'], 1, 'E', 'sql'],
    ['A primary key column must contain:', ['Duplicate values', 'NULL values', 'Unique, non-null values', 'Only numbers'], 2, 'E', 'design'],
    ['In ACID, the letter "I" stands for:', ['Isolation', 'Integrity', 'Index', 'Inheritance'], 0, 'E', 'transactions'],
    ['Which normal form removes partial dependencies?', ['1NF', '2NF', '3NF', 'BCNF'], 1, 'M', 'normalization'],
    ['Which JOIN returns every row of the left table?', ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'NATURAL JOIN'], 1, 'E', 'sql'],
    ['GROUP BY is typically used together with:', ['Aggregate functions', 'DDL statements', 'Triggers', 'Views only'], 0, 'E', 'sql'],
    ['Select all aggregate functions.', ['COUNT', 'SUM', 'CONCAT', 'AVG'], [0, 1, 3], 'E', 'sql'],
    ['The HAVING clause filters:', ['Rows before grouping', 'Groups after aggregation', 'Columns', 'Indexes'], 1, 'M', 'sql'],
    ['An index primarily improves:', ['Write speed', 'Lookup speed', 'Storage size', 'Normalization'], 1, 'E', 'indexing'],
    ['Which command undoes the current transaction?', ['COMMIT', 'ROLLBACK', 'SAVEPOINT', 'GRANT'], 1, 'E', 'transactions'],
    ['A foreign key enforces:', ['Uniqueness', 'Referential integrity', 'Sorting', 'Encryption'], 1, 'M', 'design'],
    ['In a B+ tree, leaf nodes are:', ['Linked to support range scans', 'Unordered', 'Absent', 'Hashed'], 0, 'H', 'indexing'],
    ['Which keyword removes duplicate rows from a result?', ['DISTINCT', 'REMOVE', 'TRIM', 'ONLY'], 0, 'E', 'sql'],
    ['Select all isolation levels that prevent dirty reads.', ['Read committed', 'Repeatable read', 'Serializable', 'Read uncommitted'], [0, 1, 2], 'H', 'transactions'],
    ['A deadlock occurs when:', ['Transactions wait on each other in a cycle', 'A query runs slowly', 'An index is missing', 'The disk is full'], 0, 'M', 'transactions'],
    ['How does TRUNCATE differ from DELETE?', ['It removes all rows without per-row logging and cannot use WHERE', 'They behave identically', 'It supports a WHERE clause', 'It only removes duplicates'], 0, 'H', 'sql'],
    ['BCNF is a stricter form of:', ['3NF', '1NF', '0NF', 'Denormalisation'], 0, 'H', 'normalization'],
    ['How does COUNT(column) differ from COUNT(*)?', ['COUNT(column) skips NULL values', 'They are identical', 'COUNT(*) skips NULL values', 'COUNT(column) counts tables'], 0, 'M', 'sql'],
    ['A minimal set of attributes that uniquely identifies a row is a:', ['Candidate key', 'Foreign key', 'Surrogate view', 'Composite trigger'], 0, 'M', 'design'],
    ['Which of these is a document-oriented NoSQL database?', ['MongoDB', 'MySQL', 'PostgreSQL', 'Oracle'], 0, 'E', 'nosql'],
  ],
  exm_06: [
    ['Phishing is best described as:', ['Fake messages that trick people into revealing information', 'A network scan', 'Disk encryption', 'Port forwarding'], 0, 'E', 'threats'],
    ['Which protocol secures web traffic?', ['TLS', 'Telnet', 'FTP', 'POP3'], 0, 'E', 'protocols'],
    ['Select all traits of a strong password.', ['Long', 'Unique for every site', 'Contains your name', 'Mixes character types'], [0, 1, 3], 'E', 'hygiene'],
    ['Two-factor authentication adds:', ['A second verification factor', 'Faster login', 'A backup disk', 'A VPN'], 0, 'E', 'hygiene'],
    ['SQL injection is best prevented by:', ['Parameterised queries', 'Longer URLs', 'CAPTCHAs', 'Cookies'], 0, 'M', 'appsec'],
    ['XSS stands for:', ['Cross-Site Scripting', 'Extra Secure Socket', 'XML Style Sheet', 'Cross Server Sync'], 0, 'M', 'appsec'],
    ['Ransomware typically:', ['Encrypts files and demands payment', 'Speeds up the PC', 'Blocks ads', 'Backs up files'], 0, 'E', 'threats'],
    ['The main risk of open public Wi-Fi is:', ['Man-in-the-middle attacks', 'Faster speeds', 'Lower latency', 'Higher battery use'], 0, 'E', 'threats'],
    ['The principle of least privilege means giving users:', ['Only the access they need', 'Admin rights by default', 'Shared accounts', 'No logging'], 0, 'M', 'principles'],
    ['How does hashing differ from encryption?', ['Hashing is one-way', 'Hashing is reversible with a key', 'They are the same', 'Hashing needs a public key'], 0, 'M', 'crypto'],
    ['Select all social-engineering techniques.', ['Pretexting', 'Baiting', 'Tailgating', 'Port scanning'], [0, 1, 2], 'M', 'threats'],
    ['A DDoS attack mainly targets:', ['Service availability', 'Password secrecy', 'Software patching', 'Disk encryption'], 0, 'M', 'threats'],
    ['The CIA triad stands for:', ['Confidentiality, Integrity, Availability', 'Control, Identity, Access', 'Cipher, Index, Audit', 'Core, Internet, Application'], 0, 'E', 'principles'],
    ['Salting passwords before hashing mainly defeats:', ['Rainbow-table attacks', 'Phishing', 'DDoS', 'Packet sniffing'], 0, 'H', 'crypto'],
    ['A zero-day vulnerability is one that is:', ['Unknown to the vendor and unpatched', 'Released on day zero', 'Free to download', 'Fixed within a day'], 0, 'M', 'threats'],
    ['Which protocol provides an encrypted remote shell?', ['SSH', 'Telnet', 'FTP', 'HTTP'], 0, 'E', 'protocols'],
    ['CSRF attacks are mitigated mainly with:', ['Anti-CSRF tokens', 'Larger cookies', 'Gzip compression', 'A CDN'], 0, 'H', 'appsec'],
    ['A VPN primarily:', ['Encrypts traffic through a tunnel', 'Removes malware', 'Speeds up downloads', 'Blocks all ads'], 0, 'E', 'hygiene'],
    ['Select all good responses to a suspicious email.', ['Report it', 'Do not click its links', 'Verify through an official channel', 'Forward it to everyone'], [0, 1, 2], 'E', 'hygiene'],
    ['Which sign most often warns of a man-in-the-middle attack?', ['Unexpected certificate warnings', 'Faster ping', 'More free RAM', 'A new wallpaper'], 0, 'H', 'threats'],
  ],
};

/** [text, correct value, tolerance, unit, difficulty, tag]: typed answers, appended after the multiple-choice bank. */
type NTuple = [string, number, number, string | null, Diff, string];
const NUMERIC_BANK: Record<string, NTuple[]> = {
  exm_01: [
    ['A car travels 180 km in 2.5 hours. What is its average speed?', 72, 0, 'km/h', 'E', 'quant'],
    ['A shop marks an item at ₹1,250 and gives a 12% discount. What is the selling price?', 1100, 0.5, '₹', 'M', 'quant'],
  ],
};

const DIFFICULTY = { E: 'EASY', M: 'MEDIUM', H: 'HARD' } as const;
const MARKS = { E: 1, M: 2, H: 3 } as const;
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

function buildQuestions(): Question[] {
  const out: Question[] = [];
  for (const [examId, rows] of Object.entries(BANK)) {
    rows.forEach(([text, opts, correct, diff, tag], i) => {
      const correctOriginal = Array.isArray(correct) ? correct : [correct];
      const order = shuffle(opts.map((_, k) => k));
      out.push({
        id: `q_${examId.slice(-2)}_${String(i + 1).padStart(2, '0')}`,
        examId,
        text,
        options: order.map((orig, pos) => ({ id: LETTERS[pos] as string, text: opts[orig] as string })),
        correctIds: order.flatMap((orig, pos) => (correctOriginal.includes(orig) ? [LETTERS[pos] as string] : [])),
        multi: correctOriginal.length > 1,
        marks: MARKS[diff],
        difficulty: DIFFICULTY[diff],
        tags: [tag],
      });
    });
    (NUMERIC_BANK[examId] ?? []).forEach(([text, value, tolerance, unit, diff, tag], i) => {
      out.push({
        id: `q_${examId.slice(-2)}_${String(rows.length + i + 1).padStart(2, '0')}`,
        examId, text, type: 'NUMERIC', options: [], correctIds: [], multi: false,
        answerKey: { value, tolerance, unit }, ...(unit ? { unit } : {}),
        marks: MARKS[diff], difficulty: DIFFICULTY[diff], tags: [tag],
      });
    });
  }
  return out;
}

/* ---------------------------------------------------------------- candidates */

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karthik', 'Siddharth', 'Harsh', 'Ishaan', 'Pranav',
  'Ananya', 'Diya', 'Kavya', 'Meera', 'Priya', 'Sneha', 'Isha', 'Riya', 'Nikita', 'Pooja',
  'Rahul', 'Vikram', 'Neha', 'Tanvi', 'Aditi', 'Mohammed', 'Zoya', 'Gurpreet', 'Lakshmi', 'Shreya',
];
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Iyer', 'Reddy', 'Nair', 'Mishra', 'Agarwal',
  'Banerjee', 'Chatterjee', 'Khan', 'Kulkarni', 'Joshi', 'Mehta', 'Pillai', 'Yadav', 'Chauhan', 'Rao',
];
const MAIL_DOMAINS = ['gmail.com', 'outlook.com', 'iitk.ac.in', 'vit.ac.in', 'nitt.edu', 'mitwpu.edu.in'];

function candidateState(examIdx: number, k: number): Pick<Candidate, 'status' | 'emailStatus'> {
  switch (examIdx) {
    case 0:
    case 1:
      if (k < 8) return { status: 'IN_EXAM', emailStatus: 'SENT' };
      return k === 8 ? { status: 'EMAILED', emailStatus: 'SENT' } : { status: 'INVITED', emailStatus: 'FAILED' };
    case 2:
      if (k < 7) return { status: 'EMAILED', emailStatus: 'SENT' };
      return k < 9 ? { status: 'INVITED', emailStatus: 'FAILED' } : { status: 'INVITED', emailStatus: 'PENDING' };
    case 3:
      return k === 9 ? { status: 'DISQUALIFIED', emailStatus: 'SENT' } : { status: 'SUBMITTED', emailStatus: 'SENT' };
    case 4:
      return k < 4 ? { status: 'SUBMITTED', emailStatus: 'SENT' } : { status: 'EMAILED', emailStatus: 'SENT' };
    default:
      return { status: 'INVITED', emailStatus: 'PENDING' };
  }
}

function buildCandidates(): Candidate[] {
  return Array.from({ length: 60 }, (_, i) => {
    const first = FIRST[i % 30] as string;
    const last = LAST[(i * 7 + Math.floor(i / 30) * 3) % 20] as string;
    const examIdx = i % 6;
    const k = Math.floor(i / 6);
    return {
      id: `cnd_${String(i + 1).padStart(3, '0')}`,
      name: `${first} ${last}`,
      email: `${first}.${last}${10 + ((i * 13) % 89)}@${MAIL_DOMAINS[i % MAIL_DOMAINS.length]}`.toLowerCase(),
      userId: `WUE26${1000 + i}`,
      examId: (EXAM_SEEDS[examIdx] as ExamSeed).id,
      ...candidateState(examIdx, k),
    };
  });
}

/* ---------------------------------------------------------------- sessions */

function buildSessions(candidates: Candidate[]): Session[] {
  const sessions: Session[] = [];
  candidates.forEach((c, i) => {
    const examIdx = i % 6;
    const k = Math.floor(i / 6);
    const exam = EXAM_SEEDS[examIdx] as ExamSeed;
    const hasSession = (examIdx <= 1 && k < 8) || (examIdx === 3) || (examIdx === 4 && k < 4);
    if (!hasSession) return;
    const live = exam.status === 'LIVE';
    const waiting = live && k === 7;
    const start = waiting ? NOW - 2 * MIN : new Date(exam.startsAt).getTime() + between(0, 8) * MIN;
    const elapsed = (NOW - start) / MIN;
    sessions.push({
      id: `ses_${String(sessions.length + 1).padStart(3, '0')}`,
      candidateId: c.id,
      examId: exam.id,
      status: waiting ? 'WAITING' : live ? 'LIVE' : c.status === 'DISQUALIFIED' ? 'TERMINATED' : 'SUBMITTED',
      progress: waiting ? 0 : live ? Math.max(5, Math.min(96, Math.round((elapsed / exam.durationMin) * 100) + between(-12, 6))) : 100,
      riskScore: 0,
      warnings: 0,
      startedAt: iso(start),
    });
  });
  return sessions;
}

/* ---------------------------------------------------------------- browsing + violations */

const NORMAL_PAGES: { url: string; title: string; query?: string }[] = [
  { url: 'https://docs.python.org/3/library/functions.html', title: 'Built-in Functions — Python 3 documentation' },
  { url: 'https://visualgo.net/en/sorting', title: 'Sorting (Bubble, Selection, Insertion, Merge) - VisuAlgo' },
  { url: 'https://cppreference.com/w/cpp/container/vector', title: 'std::vector - cppreference.com' },
  { url: 'https://kubernetes.io/docs/concepts/workloads/pods/', title: 'Pods | Kubernetes' },
  { url: 'https://docs.docker.com/reference/cli/docker/container/ls/', title: 'docker container ls | Docker Docs' },
  { url: 'https://www.google.com/search?q=binary+search+time+complexity', title: 'binary search time complexity - Google Search', query: 'binary search time complexity' },
  { url: 'https://www.google.com/search?q=difference+between+tuple+and+list', title: 'difference between tuple and list - Google Search', query: 'difference between tuple and list' },
  { url: 'https://www.google.com/search?q=sql+group+by+having', title: 'sql group by having - Google Search', query: 'sql group by having' },
  { url: 'https://en.wikipedia.org/wiki/Binary_search_tree', title: 'Binary search tree - Wikipedia' },
  { url: 'https://www.geeksforgeeks.org/introduction-to-hashing-data-structure-and-algorithm-tutorial/', title: 'Introduction to Hashing - GeeksforGeeks' },
];

const AI_PAGES: { url: string; title: string; query: string }[] = [
  { url: 'https://chatgpt.com/', title: 'ChatGPT', query: 'solve: a train 150 m long passes a pole in 15 s, find speed in km/h' },
  { url: 'https://gemini.google.com/app', title: 'Google Gemini', query: 'time complexity of quicksort worst case with explanation' },
  { url: 'https://claude.ai/new', title: 'Claude', query: 'write a python decorator that caches results, give answer only' },
  { url: 'https://www.perplexity.ai/', title: 'Perplexity', query: 'which normal form removes partial dependency' },
  { url: 'https://copilot.microsoft.com/', title: 'Microsoft Copilot', query: 'sql query to find second highest salary' },
];

const CODE_POOL: ViolationCode[] = [
  ...Array<ViolationCode>(5).fill('GAZE_AWAY'),
  ...Array<ViolationCode>(4).fill('WINDOW_BLUR'),
  ...Array<ViolationCode>(3).fill('NO_FACE'),
  ...Array<ViolationCode>(3).fill('SHORTCUT_BLOCKED'),
  ...Array<ViolationCode>(2).fill('CLIPBOARD_USE'),
  ...Array<ViolationCode>(2).fill('NETWORK_LOST'),
  ...Array<ViolationCode>(2).fill('MULTIPLE_FACES'),
  'EXTERNAL_DEVICE', 'SCREEN_SHARE_STOPPED', 'CAMERA_BLOCKED', 'FACE_MISMATCH', 'BLACKLISTED_APP',
  'MULTI_MONITOR', 'SCREEN_MIRRORING', 'MULTI_LOGIN', 'VM_DETECTED', 'REMOTE_DESKTOP',
];

function build(sessions: Session[], exams: ExamSeed[]) {
  const browsing: BrowsingLog[] = [];
  const violations: Violation[] = [];
  const active = sessions.filter((s) => s.status !== 'WAITING');
  const windowOf = (s: Session): [number, number] => {
    const start = new Date(s.startedAt).getTime();
    const exam = exams.find((e) => e.id === s.examId) as ExamSeed;
    return [start, s.status === 'LIVE' ? NOW - 20_000 : start + exam.durationMin * MIN * 0.95];
  };
  const within = (s: Session): number => {
    const [from, to] = windowOf(s);
    return from + Math.floor(rnd() * (to - from));
  };

  // Browsing logs first so that AI sites also produce matching violations.
  for (const s of active) {
    const count = between(3, 7);
    for (let n = 0; n < count; n++) {
      const page = pick(NORMAL_PAGES);
      browsing.push({
        id: `bl_${String(browsing.length + 1).padStart(4, '0')}`,
        sessionId: s.id, at: iso(within(s)), url: page.url, title: page.title,
        ...(page.query ? { query: page.query } : {}), flaggedAi: false,
      });
    }
    if (rnd() < 0.3) {
      for (let n = between(1, 3); n > 0; n--) {
        const page = pick(AI_PAGES);
        const at = within(s);
        browsing.push({
          id: `bl_${String(browsing.length + 1).padStart(4, '0')}`,
          sessionId: s.id, at: iso(at), url: page.url, title: page.title, query: page.query, flaggedAi: true,
        });
        violations.push(makeViolation(s.id, 'AI_SITE_OPENED', at));
        violations.push(makeViolation(s.id, 'AI_QUERY_DETECTED', at + 20_000));
      }
    }
  }

  const terminated = sessions.find((s) => s.status === 'TERMINATED');
  if (terminated && !violations.some((v) => v.sessionId === terminated.id && v.severity === 'CRITICAL')) {
    violations.push(makeViolation(terminated.id, 'MULTI_LOGIN', within(terminated)));
  }

  while (violations.length < 150) {
    // Squaring the draw skews violations towards the first few sessions, giving a realistic "hot" tail.
    const s = active[Math.floor(rnd() ** 1.8 * active.length)] as Session;
    violations.push(makeViolation(s.id, pick(CODE_POOL), within(s)));
  }

  for (const v of violations) {
    const s = sessions.find((x) => x.id === v.sessionId) as Session;
    if (s.status !== 'LIVE' && rnd() < 0.55) v.reviewed = rnd() < 0.7 ? 'CONFIRMED' : 'OVERRULED';
  }
  violations.sort((a, b) => b.at.localeCompare(a.at));
  browsing.sort((a, b) => b.at.localeCompare(a.at));

  for (const s of sessions) {
    const mine = violations.filter((v) => v.sessionId === s.id);
    s.riskScore = computeRisk(mine);
    s.warnings = Math.min(3, mine.filter((v) => v.severity !== 'LOW').length);
  }
  return { violations, browsing };
}

/* ---------------------------------------------------------------- exports */

export const QUESTIONS: Question[] = buildQuestions();
export const CANDIDATES: Candidate[] = buildCandidates();
export const SESSIONS: Session[] = buildSessions(CANDIDATES);
const generated = build(SESSIONS, EXAM_SEEDS);
export const VIOLATIONS: Violation[] = generated.violations;
export const BROWSING_LOGS: BrowsingLog[] = generated.browsing;

export const EXAMS: Exam[] = EXAM_SEEDS.map((e) => {
  const qs = QUESTIONS.filter((q) => q.examId === e.id);
  return {
    ...e,
    questionCount: qs.length,
    totalMarks: qs.reduce((sum, q) => sum + q.marks, 0),
    candidateCount: CANDIDATES.filter((c) => c.examId === e.id).length,
  };
});
