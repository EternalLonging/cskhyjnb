// =============================================================================
// 计算机组成原理 — 填空题转换为选择题（来自 二填空题.pdf，共22题，题号8-30）
// 题目经过精心设计，将填空题的每个空转换为合理的选择题选项
// =============================================================================

const computerOrgFillToChoice = [
  // === 题8 === 原题：目前的 CPU 包括___和___。（答案：运算器、控制器）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 1,
    type: "single",
    text: "目前的 CPU 主要由下面哪两个部件组成。",
    options: [
      { label: "A", text: "运算器和存储器" },
      { label: "B", text: "运算器和控制器" },
      { label: "C", text: "控制器和存储器" },
      { label: "D", text: "运算器和输入输出设备" }
    ],
    answer: "B",
    id: "计组填空-1"
  },
  // === 题9 === 原题：控制器控制计算机的运行总是处于___、___和___的循环之中。（答案：取指、分析指令、执行指令）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 2,
    type: "single",
    text: "在程序执行过程中，控制器控制计算机的运行总是处于什么循环之中。",
    options: [
      { label: "A", text: "取指、译码、执行" },
      { label: "B", text: "读数据、处理、写数据" },
      { label: "C", text: "输入、运算、输出" },
      { label: "D", text: "取指令、执行指令、存储结果" }
    ],
    answer: "A",
    id: "计组填空-2"
  },
  // === 题10 === 原题：微程序入口地址是___根据指令的___产生的。（答案：译码器、操作码）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 3,
    type: "single",
    text: "微程序入口地址是根据指令的什么字段产生的。",
    options: [
      { label: "A", text: "地址码" },
      { label: "B", text: "操作码" },
      { label: "C", text: "立即数" },
      { label: "D", text: "校验码" }
    ],
    answer: "B",
    id: "计组填空-3"
  },
  // === 题11 === 原题：微程序控制器的核心部件是___，它一般用___构成。（答案：控制存储器、只读存储器）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 4,
    type: "single",
    text: "微程序控制器的核心部件是什么，它一般用什么构成。",
    options: [
      { label: "A", text: "指令寄存器，用触发器构成" },
      { label: "B", text: "控制存储器，用只读存储器构成" },
      { label: "C", text: "程序计数器，用计数器构成" },
      { label: "D", text: "通用寄存器组，用 RAM 构成" }
    ],
    answer: "B",
    id: "计组填空-4"
  },
  // === 题12 === 原题：产生后继微地址的方法主要有___和___等。（答案：计数器方式、断定方式）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 5,
    type: "single",
    text: "微指令执行时，产生后继微地址的方法主要有哪些。",
    options: [
      { label: "A", text: "直接方式和间接方式" },
      { label: "B", text: "计数器方式和断定方式" },
      { label: "C", text: "顺序方式和跳跃方式" },
      { label: "D", text: "绝对方式和相对方式" }
    ],
    answer: "B",
    id: "计组填空-5"
  },
  // === 题13 === 原题：一条机器指令的执行可与一段微指令构成的___相对应，微指令可由一系列___组成。（答案：微程序、微命令）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 6,
    type: "single",
    text: "一条机器指令的执行与微指令的关系，下面哪项说法正确。",
    options: [
      { label: "A", text: "一条机器指令对应一条微指令" },
      { label: "B", text: "一条机器指令对应一段微程序，微指令由微命令组成" },
      { label: "C", text: "一条微指令对应一段机器指令" },
      { label: "D", text: "机器指令和微指令没有直接关系" }
    ],
    answer: "B",
    id: "计组填空-6"
  },
  // === 题14 === 原题：保存当前栈顶地址的寄存器叫___。（答案：栈指针 SP）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 7,
    type: "single",
    text: "保存当前栈顶地址的寄存器叫什么。",
    options: [
      { label: "A", text: "指令寄存器（IR）" },
      { label: "B", text: "程序计数器（PC）" },
      { label: "C", text: "堆栈指针（SP）" },
      { label: "D", text: "基址寄存器（BR）" }
    ],
    answer: "C",
    id: "计组填空-7"
  },
  // === 题15 === 原题：实现输入输出数据传送方式分成三种：___、___和程序控制方式。（答案：程序查询方式/应答式、中断方式）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 8,
    type: "single",
    text: "实现输入输出数据传送的方式不包括下面哪项。",
    options: [
      { label: "A", text: "程序查询方式" },
      { label: "B", text: "中断方式" },
      { label: "C", text: "DMA 方式" },
      { label: "D", text: "存储器直接访问方式" }
    ],
    answer: "D",
    id: "计组填空-8"
  },
  // === 题16 === 原题：计算机中各功能部件是通过___连接的。（答案：总线）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 9,
    type: "single",
    text: "计算机中各功能部件是通过什么连接的。",
    options: [
      { label: "A", text: "专用线路" },
      { label: "B", text: "总线" },
      { label: "C", text: "交换机" },
      { label: "D", text: "串行链路" }
    ],
    answer: "B",
    id: "计组填空-9"
  },
  // === 题17 === 原题：计算机中总线的两个主要特征是___和___。（答案：分时、共享）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 10,
    type: "single",
    text: "计算机中总线的两个主要特征是什么。",
    options: [
      { label: "A", text: "高速和低速" },
      { label: "B", text: "并行和串行" },
      { label: "C", text: "分时和共享" },
      { label: "D", text: "同步和异步" }
    ],
    answer: "C",
    id: "计组填空-10"
  },
  // === 题18 === 原题：计数制中使用的数据个数被称为___。（答案：基数）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 11,
    type: "single",
    text: "计数制中使用的数码个数被称为什么。",
    options: [
      { label: "A", text: "权值" },
      { label: "B", text: "基数" },
      { label: "C", text: "位值" },
      { label: "D", text: "模数" }
    ],
    answer: "B",
    id: "计组填空-11"
  },
  // === 题19 === 原题：在用___表示的机器数中，零的编码是唯一的。（答案：补码）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 12,
    type: "single",
    text: "在下面哪种机器数表示中，零的编码是唯一的。",
    options: [
      { label: "A", text: "原码" },
      { label: "B", text: "反码" },
      { label: "C", text: "补码" },
      { label: "D", text: "原码和反码" }
    ],
    answer: "C",
    id: "计组填空-12"
  },
  // === 题20 === 原题：信息的数字化编码是指___。（答案：用0和1的二进制编码来表示信息）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 13,
    type: "single",
    text: "信息的数字化编码是指什么。",
    options: [
      { label: "A", text: "用十进制数字表示信息" },
      { label: "B", text: "用0和1的二进制编码按一定组合规则表示信息" },
      { label: "C", text: "用 ASCII 码表示信息" },
      { label: "D", text: "用格雷码表示信息" }
    ],
    answer: "B",
    id: "计组填空-13"
  },
  // === 题21 === 原题：一个定点数由___和___组成。根据小数点位置不同有___和___两种。（答案：符号位、数值位、纯小数、纯整数）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 14,
    type: "single",
    text: "一个定点数由哪两部分组成。",
    options: [
      { label: "A", text: "整数部分和小数部分" },
      { label: "B", text: "符号位和数值位" },
      { label: "C", text: "阶码和尾数" },
      { label: "D", text: "基数和权值" }
    ],
    answer: "B",
    id: "计组填空-14"
  },
  // === 题22 === 原题：移码常用来表示浮点数的___部分。（答案：阶码）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 15,
    type: "single",
    text: "移码常用来表示浮点数的哪一部分。",
    options: [
      { label: "A", text: "尾数" },
      { label: "B", text: "阶码" },
      { label: "C", text: "符号位" },
      { label: "D", text: "有效数字" }
    ],
    answer: "B",
    id: "计组填空-15"
  },
  // === 题23 === 原题：码距的定义是___。（答案：任意两个合法码之间不同二进制位数的最小值）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 16,
    type: "single",
    text: "码距的定义是什么。",
    options: [
      { label: "A", text: "任意两个合法编码之间不同二进制位数的最大值" },
      { label: "B", text: "任意两个合法编码之间不同二进制位数的最小值" },
      { label: "C", text: "一个编码中1的个数" },
      { label: "D", text: "编码的总位数" }
    ],
    answer: "B",
    id: "计组填空-16"
  },
  // === 题24 === 原题：8421码用二进制求和时，当和超过___时，需要做___修正。（答案：9、加6调整）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 17,
    type: "single",
    text: "8421码用二进制求和时，当和超过9时，需要做什么修正。",
    options: [
      { label: "A", text: "加2调整" },
      { label: "B", text: "加4调整" },
      { label: "C", text: "加6调整" },
      { label: "D", text: "加10调整" }
    ],
    answer: "C",
    id: "计组填空-17"
  },
  // === 题25 === 原题：奇偶校验只能检测___，无法检测___。（答案：奇数个错、偶数个错）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 18,
    type: "single",
    text: "奇偶校验的检测能力，下面哪项说法正确。",
    options: [
      { label: "A", text: "能检测所有错误并纠正" },
      { label: "B", text: "只能检测奇数个错误，无法检测偶数个错误" },
      { label: "C", text: "只能检测偶数个错误，无法检测奇数个错误" },
      { label: "D", text: "能检测和纠正一位错误" }
    ],
    answer: "B",
    id: "计组填空-18"
  },
  // === 题26 === 原题：浮点加减法运算中，当结果的尾数绝对值大于1时，需要对结果进行___。（答案：向右规格化）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 19,
    type: "single",
    text: "在浮点加减法运算中，当运算结果的尾数的绝对值大于1时，需要对结果进行什么操作。",
    options: [
      { label: "A", text: "向左规格化" },
      { label: "B", text: "向右规格化" },
      { label: "C", text: "舍入处理" },
      { label: "D", text: "溢出处理" }
    ],
    answer: "B",
    id: "计组填空-19"
  },
  // === 题27 === 原题：闪速存储器能提供___能力，作为___用于便携式电脑中。（答案：即时启动、固态盘）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 20,
    type: "single",
    text: "闪速存储器（Flash Memory）在便携式电脑中常用作什么。",
    options: [
      { label: "A", text: "主存（RAM）" },
      { label: "B", text: "高速缓存（Cache）" },
      { label: "C", text: "固态盘（SSD）" },
      { label: "D", text: "寄存器组" }
    ],
    answer: "C",
    id: "计组填空-20"
  },
  // === 题28 === 原题：一个完整的磁盘存储器由三部分组成：___、___、___。（答案：磁盘驱动器、磁盘控制器、磁盘盘片）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 21,
    type: "single",
    text: "磁盘机与主机的接口部件是什么。",
    options: [
      { label: "A", text: "磁盘驱动器" },
      { label: "B", text: "磁盘控制器" },
      { label: "C", text: "磁盘盘片" },
      { label: "D", text: "磁头组件" }
    ],
    answer: "B",
    id: "计组填空-21"
  },
  // === 题29 === 原题：CPU 中保存当前正在执行的指令的寄存器为___，保存下一条指令地址的寄存器为___。（答案：指令寄存器 IR、程序计数器 PC）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 22,
    type: "single",
    text: "CPU 中保存当前正在执行的指令的寄存器是什么。",
    options: [
      { label: "A", text: "地址寄存器（MAR）" },
      { label: "B", text: "程序计数器（PC）" },
      { label: "C", text: "指令寄存器（IR）" },
      { label: "D", text: "通用寄存器（GR）" }
    ],
    answer: "C",
    id: "计组填空-22"
  },
  // === 题30 === 原题：沿磁盘半径方向单位长度上的磁道数称为___，磁道单位长度上能记录的二进制代码位数称为___。（答案：道密度、位密度）
  {
    source: "计算机组成原理填空题",
    source_stem: "计组填空转选择",
    topic: "计算机组成原理",
    number: 23,
    type: "single",
    text: "沿磁盘半径方向单位长度上的磁道数称为什么。",
    options: [
      { label: "A", text: "位密度" },
      { label: "B", text: "存储密度" },
      { label: "C", text: "道密度" },
      { label: "D", text: "记录密度" }
    ],
    answer: "C",
    id: "计组填空-23"
  }
];
