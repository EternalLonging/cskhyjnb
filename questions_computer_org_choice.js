// =============================================================================
// 计算机组成原理 题目数据
// 来源：jiati/ 文件夹中的 PDF 文件（经 OCR 提取 + 人工校对）
// 包含：50道选择题 + 22道填空题（已转换为选择题）
// =============================================================================

const computerOrgQuestions = [
  // ===== 选择题（来自 计算机组成原理.pdf，共50题） =====
  // 第1页（题1-15）
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 1,
    type: "single",
    text: "在下列四句话中，最能反映计算机主要功能的是下面哪项。",
    options: [
      { label: "A", text: "计算机可以存储大量信息" },
      { label: "B", text: "计算机能代替人的脑力劳动" },
      { label: "C", text: "计算机是一种信息处理机" },
      { label: "D", text: "计算机可实现高速运算" }
    ],
    answer: "C",
    id: "计组选择-1"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 2,
    type: "single",
    text: "计算机硬件能直接执行的只能是下面哪项。",
    options: [
      { label: "A", text: "符号语言" },
      { label: "B", text: "汇编语言" },
      { label: "C", text: "机器语言" },
      { label: "D", text: "机器语言和汇编语言" }
    ],
    answer: "C",
    id: "计组选择-2"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 3,
    type: "single",
    text: "运算器的核心部件是下面哪项。",
    options: [
      { label: "A", text: "数据总线" },
      { label: "B", text: "数据选择器" },
      { label: "C", text: "算术逻辑运算部件（ALU）" },
      { label: "D", text: "累加寄存器" }
    ],
    answer: "C",
    id: "计组选择-3"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 4,
    type: "single",
    text: "对于存储器的主要作用，下面哪项说法正确。",
    options: [
      { label: "A", text: "存放程序" },
      { label: "B", text: "存放数据" },
      { label: "C", text: "存放程序和数据" },
      { label: "D", text: "存放微程序" }
    ],
    answer: "C",
    id: "计组选择-4"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 5,
    type: "single",
    text: "至今为止，计算机中所含所有信息仍以二进制方式表示，其原因是下面哪项。",
    options: [
      { label: "A", text: "节约元件" },
      { label: "B", text: "运算速度快" },
      { label: "C", text: "物理器件性能决定" },
      { label: "D", text: "信息处理方便" }
    ],
    answer: "C",
    id: "计组选择-5"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 6,
    type: "single",
    text: "CPU 中有若干寄存器，其中存放存储器中数据的寄存器是下面哪项。",
    options: [
      { label: "A", text: "地址寄存器（MAR）" },
      { label: "B", text: "程序计数器（PC）" },
      { label: "C", text: "数据寄存器（MDR）" },
      { label: "D", text: "指令寄存器（IR）" }
    ],
    answer: "C",
    id: "计组选择-6"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 7,
    type: "single",
    text: "CPU 中有若干寄存器，其中存放机器指令的寄存器是下面哪项。",
    options: [
      { label: "A", text: "地址寄存器（MAR）" },
      { label: "B", text: "程序计数器（PC）" },
      { label: "C", text: "指令寄存器（IR）" },
      { label: "D", text: "数据寄存器（MDR）" }
    ],
    answer: "C",
    id: "计组选择-7"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 8,
    type: "single",
    text: "CPU 中有若干寄存器，存放 CPU 将要执行的下一条指令地址的寄存器是下面哪项。",
    options: [
      { label: "A", text: "地址寄存器（MAR）" },
      { label: "B", text: "数据寄存器（MDR）" },
      { label: "C", text: "程序计数器（PC）" },
      { label: "D", text: "指令寄存器（IR）" }
    ],
    answer: "C",
    id: "计组选择-8"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 9,
    type: "single",
    text: "CPU 中程序状态寄存器中的各个状态标志位是依据下面哪项来置位的。",
    options: [
      { label: "A", text: "CPU 已执行的指令" },
      { label: "B", text: "CPU 将要执行的指令" },
      { label: "C", text: "算术逻辑部件上次的运算结果" },
      { label: "D", text: "累加器中的数据" }
    ],
    answer: "C",
    id: "计组选择-9"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 10,
    type: "single",
    text: "为协调计算机各部件的工作，需要下面哪项来提供统一的时钟。",
    options: [
      { label: "A", text: "总线缓冲器" },
      { label: "B", text: "时钟发生器" },
      { label: "C", text: "总线控制器" },
      { label: "D", text: "操作命令发生器" }
    ],
    answer: "B",
    id: "计组选择-10"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 11,
    type: "single",
    text: "下列各种数制的数中最小的数是下面哪项。",
    options: [
      { label: "A", text: "$(101001)_2$" },
      { label: "B", text: "$(52)_8$" },
      { label: "C", text: "$(101001)_{BCD}$" },
      { label: "D", text: "$(233)_{16}$" }
    ],
    answer: "C",
    id: "计组选择-11"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 12,
    type: "single",
    text: "下列各种数制的数中最大的数是下面哪项。",
    options: [
      { label: "A", text: "$(1001011)_2$" },
      { label: "B", text: "$75$" },
      { label: "C", text: "$(112)_8$" },
      { label: "D", text: "$(4F)_{16}$" }
    ],
    answer: "D",
    id: "计组选择-12"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 13,
    type: "single",
    text: "将十进制数 $15/2$ 表示成二进制浮点规格化数（阶符1位，阶码2位，数符1位，尾数4位）是下面哪项。",
    options: [
      { label: "A", text: "$0\\,1\\,0\\,1101\\,110$" },
      { label: "B", text: "$0\\,1\\,0\\,1101\\,111$" },
      { label: "C", text: "$0\\,1\\,1\\,1111\\,111$" },
      { label: "D", text: "$1\\,1\\,1\\,1111\\,111$" }
    ],
    answer: "B",
    id: "计组选择-13"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 14,
    type: "single",
    text: "能发现两位错误并能纠正一位错的编码是下面哪种编码。",
    options: [
      { label: "A", text: "海明码" },
      { label: "B", text: "CRC 码" },
      { label: "C", text: "偶校验码" },
      { label: "D", text: "奇校验码" }
    ],
    answer: "A",
    id: "计组选择-14"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 15,
    type: "single",
    text: "假定下列字符码中有奇偶校验位，但没有数据错误，采用偶校验的字符码是下面哪项。",
    options: [
      { label: "A", text: "$11001011$" },
      { label: "B", text: "$11010110$" },
      { label: "C", text: "$11000001$" },
      { label: "D", text: "$11001001$" }
    ],
    answer: "D",
    id: "计组选择-15"
  },
  // 第2页（题16-29）
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 16,
    type: "single",
    text: "下列存储器中，速度最慢的是下面哪项。",
    options: [
      { label: "A", text: "半导体存储器" },
      { label: "B", text: "光盘存储器" },
      { label: "C", text: "磁带存储器" },
      { label: "D", text: "硬盘存储器" }
    ],
    answer: "C",
    id: "计组选择-16"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 17,
    type: "single",
    text: "某一 SRAM 芯片，容量为 $16K \\times 1$ 位，则其地址线条数下面哪项正确。",
    options: [
      { label: "A", text: "18根" },
      { label: "B", text: "10根" },
      { label: "C", text: "14根" },
      { label: "D", text: "22根" }
    ],
    answer: "C",
    id: "计组选择-17"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 18,
    type: "single",
    text: "下列部件（设备）中，存取速度最快的是下面哪项。",
    options: [
      { label: "A", text: "光盘存储器" },
      { label: "B", text: "CPU 的寄存器" },
      { label: "C", text: "软盘存储器" },
      { label: "D", text: "硬盘存储器" }
    ],
    answer: "B",
    id: "计组选择-18"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 19,
    type: "single",
    text: "在主存和 CPU 之间增加 Cache 的目的是下面哪项。",
    options: [
      { label: "A", text: "解决 CPU 和主存之间的速度匹配" },
      { label: "B", text: "增加 CPU 中通用寄存器的数量" },
      { label: "C", text: "代替 CPU 中的寄存器工作" },
      { label: "D", text: "扩大主存的容量" }
    ],
    answer: "A",
    id: "计组选择-19"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 20,
    type: "single",
    text: "计算机的存储器采用分级存储体系的目的是下面哪项。",
    options: [
      { label: "A", text: "便于读写数据" },
      { label: "B", text: "减小机箱的体积" },
      { label: "C", text: "便于系统升级" },
      { label: "D", text: "解决存储容量、价格与存取速度间的矛盾" }
    ],
    answer: "D",
    id: "计组选择-20"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 21,
    type: "single",
    text: "某 SRAM 芯片，其容量为 $1K \\times 8$ 位，加上电源端和接地端后，该芯片的引出线的最少数目下面哪项正确。",
    options: [
      { label: "A", text: "20" },
      { label: "B", text: "24" },
      { label: "C", text: "50" },
      { label: "D", text: "30" }
    ],
    answer: "A",
    id: "计组选择-21"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 22,
    type: "single",
    text: "常用的虚拟存储器由两级存储器组成。下面哪项说法正确。",
    options: [
      { label: "A", text: "主存—辅存" },
      { label: "B", text: "快存—主存" },
      { label: "C", text: "快存—辅存" },
      { label: "D", text: "通用寄存器—主存" }
    ],
    answer: "A",
    id: "计组选择-22"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 23,
    type: "single",
    text: "在 Cache 的地址映射中，若主存中的任意一块均可映射到 Cache 内的任意一块的位置上，下面哪项符合这种特点。",
    options: [
      { label: "A", text: "直接映射" },
      { label: "B", text: "全相联映射" },
      { label: "C", text: "组相联映射" },
      { label: "D", text: "混合映射" }
    ],
    answer: "B",
    id: "计组选择-23"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 24,
    type: "single",
    text: "指令系统中采用不同寻址方式的目的主要是下面哪项。",
    options: [
      { label: "A", text: "实现程序控制和快速查找存储器地址" },
      { label: "B", text: "缩短指令长度，扩大寻址空间，提高编程灵活性" },
      { label: "C", text: "可以直接访问主存和外存" },
      { label: "D", text: "降低指令译码难度" }
    ],
    answer: "B",
    id: "计组选择-24"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 25,
    type: "single",
    text: "CPU 组成中不包括下面哪项。",
    options: [
      { label: "A", text: "指令寄存器（IR）" },
      { label: "B", text: "地址寄存器（MAR）" },
      { label: "C", text: "指令译码器" },
      { label: "D", text: "地址译码器" }
    ],
    answer: "D",
    id: "计组选择-25"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 26,
    type: "single",
    text: "程序计数器 PC 在下面哪项部件中。",
    options: [
      { label: "A", text: "运算器" },
      { label: "B", text: "存储器" },
      { label: "C", text: "控制器" },
      { label: "D", text: "I/O 接口" }
    ],
    answer: "C",
    id: "计组选择-26"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 27,
    type: "single",
    text: "CPU 内通用寄存器的位数取决于下面哪项。",
    options: [
      { label: "A", text: "存储器容量" },
      { label: "B", text: "机器字长" },
      { label: "C", text: "指令的长度" },
      { label: "D", text: "CPU 的引脚数" }
    ],
    answer: "B",
    id: "计组选择-27"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 28,
    type: "single",
    text: "以硬件逻辑电路方式构成的控制器又称为下面哪个名称。",
    options: [
      { label: "A", text: "存储逻辑型控制器" },
      { label: "B", text: "组合逻辑型控制器" },
      { label: "C", text: "微程序控制器" },
      { label: "D", text: "运算器" }
    ],
    answer: "B",
    id: "计组选择-28"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 29,
    type: "single",
    text: "直接转移指令的功能是将指令中的地址代码送入下面哪个部件中。",
    options: [
      { label: "A", text: "累加器" },
      { label: "B", text: "地址寄存器" },
      { label: "C", text: "PC 寄存器" },
      { label: "D", text: "存储器" }
    ],
    answer: "C",
    id: "计组选择-29"
  },
  // 第3页（题30-40）
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 30,
    type: "single",
    text: "状态寄存器用来存放下面哪些内容。",
    options: [
      { label: "A", text: "算术运算结果" },
      { label: "B", text: "算术、逻辑运算及测试指令的结果状态" },
      { label: "C", text: "运算类型" },
      { label: "D", text: "逻辑运算结果" }
    ],
    answer: "B",
    id: "计组选择-30"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 31,
    type: "single",
    text: "微程序放在下面哪个部件中。",
    options: [
      { label: "A", text: "指令寄存器" },
      { label: "B", text: "RAM" },
      { label: "C", text: "内存" },
      { label: "D", text: "控制存储器" }
    ],
    answer: "D",
    id: "计组选择-31"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 32,
    type: "single",
    text: "微程序控制器中，机器指令与微指令的关系下面哪项说法正确。",
    options: [
      { label: "A", text: "每一条机器指令由一条微指令执行" },
      { label: "B", text: "一段机器指令组成的程序可由一条微指令来执行" },
      { label: "C", text: "每一条机器指令由一段用微指令编成的微程序来解释执行" },
      { label: "D", text: "一条微指令由若干条机器指令组成" }
    ],
    answer: "C",
    id: "计组选择-32"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 33,
    type: "single",
    text: "异步控制常作为下面哪项的主要控制方式。",
    options: [
      { label: "A", text: "微型机的 CPU 控制中" },
      { label: "B", text: "单总线结构计算机中访问主存和外部设备时" },
      { label: "C", text: "组合逻辑的 CPU 控制中" },
      { label: "D", text: "微程序控制器中" }
    ],
    answer: "B",
    id: "计组选择-33"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 34,
    type: "single",
    text: "在显示器的技术指标中，数据 $640 \\times 480$，$1024 \\times 768$ 等表示下面哪项特征。",
    options: [
      { label: "A", text: "显示器屏幕的大小" },
      { label: "B", text: "显示器显示字符的最大行数和列数" },
      { label: "C", text: "显示器的颜色指标" },
      { label: "D", text: "显示器的分辨率" }
    ],
    answer: "D",
    id: "计组选择-34"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 35,
    type: "single",
    text: "主机、外设不能并行工作的方式是下面哪项。",
    options: [
      { label: "A", text: "中断方式" },
      { label: "B", text: "程序查询方式" },
      { label: "C", text: "通道方式" },
      { label: "D", text: "DMA 方式" }
    ],
    answer: "B",
    id: "计组选择-35"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 36,
    type: "single",
    text: "在 I/O 单独（独立）编址下，下面的说法哪项正确。",
    options: [
      { label: "A", text: "一个具体地址只能对应输入输出设备" },
      { label: "B", text: "一个具体地址既可对应输入输出设备，也可对应内存单元" },
      { label: "C", text: "一个具体地址只能对应内存单元" },
      { label: "D", text: "只对应内存单元或只对应 I/O 设备" }
    ],
    answer: "A",
    id: "计组选择-36"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 37,
    type: "single",
    text: "禁止中断的功能可由下面哪项来完成。",
    options: [
      { label: "A", text: "中断触发器" },
      { label: "B", text: "中断禁止触发器" },
      { label: "C", text: "中断屏蔽触发器" },
      { label: "D", text: "中断允许触发器" }
    ],
    answer: "C",
    id: "计组选择-37"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 38,
    type: "single",
    text: "在微机系统中，主机与高速硬盘进行数据交换一般用下面哪种方式。",
    options: [
      { label: "A", text: "程序中断控制" },
      { label: "B", text: "程序直接控制" },
      { label: "C", text: "DMA 方式" },
      { label: "D", text: "通道方式" }
    ],
    answer: "C",
    id: "计组选择-38"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 39,
    type: "single",
    text: "常用于大型计算机的控制方式是下面哪项。",
    options: [
      { label: "A", text: "程序中断控制" },
      { label: "B", text: "程序直接控制" },
      { label: "C", text: "通道方式" },
      { label: "D", text: "DMA 方式" }
    ],
    answer: "C",
    id: "计组选择-39"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 40,
    type: "single",
    text: "有关中断的论述不正确的是下面哪项。",
    options: [
      { label: "A", text: "可实现多道程序、分时操作、实时操作" },
      { label: "B", text: "对硬盘采用中断可能引起数据丢失" },
      { label: "C", text: "CPU 和 I/O 设备可并行工作，但设备间不可并行工作" },
      { label: "D", text: "计算机的中断源可来自主机，也可来自外设" }
    ],
    answer: "C",
    id: "计组选择-40"
  },
  // 第4页（题41-50）
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 41,
    type: "single",
    text: "DMA 方式数据的传送是以什么为单位进行的。",
    options: [
      { label: "A", text: "字节" },
      { label: "B", text: "字" },
      { label: "C", text: "数据块" },
      { label: "D", text: "位" }
    ],
    answer: "C",
    id: "计组选择-41"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 42,
    type: "single",
    text: "DMA 方式在哪两个设备之间建立的直接数据通路。",
    options: [
      { label: "A", text: "主存与外设" },
      { label: "B", text: "CPU 与外设" },
      { label: "C", text: "外设与外设" },
      { label: "D", text: "CPU 与主存" }
    ],
    answer: "A",
    id: "计组选择-42"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 43,
    type: "single",
    text: "信息只用一条传输线，且采用脉冲传输的方式是下面哪种传输方式。",
    options: [
      { label: "A", text: "并行传输" },
      { label: "B", text: "串行传输" },
      { label: "C", text: "并串行传输" },
      { label: "D", text: "分时传输" }
    ],
    answer: "B",
    id: "计组选择-43"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 44,
    type: "single",
    text: "在哪一种总线结构的计算机系统中，外设地址可以与主存储器单元统一编址。",
    options: [
      { label: "A", text: "三总线" },
      { label: "B", text: "单总线" },
      { label: "C", text: "双总线" },
      { label: "D", text: "以上三种都可以" }
    ],
    answer: "B",
    id: "计组选择-44"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 45,
    type: "single",
    text: "系统总线中地址线的功能，下面哪项说法正确。",
    options: [
      { label: "A", text: "用于选择主存单元地址" },
      { label: "B", text: "用于选择进行信息传输的设备" },
      { label: "C", text: "用于选择外存地址" },
      { label: "D", text: "用于指定主存和 I/O 设备接口电路的地址" }
    ],
    answer: "D",
    id: "计组选择-45"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 46,
    type: "single",
    text: "有一个 CRT 的分辨率是 $1024 \\times 768$ 像素，颜色数为 256 色。则刷新存储器的容量是下面哪项。",
    options: [
      { label: "A", text: "$768$ KB" },
      { label: "B", text: "$512$ KB" },
      { label: "C", text: "$256$ KB" },
      { label: "D", text: "$2$ MB" }
    ],
    answer: "A",
    id: "计组选择-46"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 47,
    type: "single",
    text: "十进制数 $5$ 的单精度浮点数 IEEE754 代码是下面哪项。",
    options: [
      { label: "A", text: "$01000000\\,10100000\\,00000000\\,00000000$" },
      { label: "B", text: "$11000000\\,10100000\\,00000000\\,00000000$" },
      { label: "C", text: "$01100000\\,10100000\\,00000000\\,00000000$" },
      { label: "D", text: "$11000000\\,10100000\\,00000000\\,00000000$" }
    ],
    answer: "A",
    id: "计组选择-47"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 48,
    type: "single",
    text: "在微机系统中，外设通过下面哪项与主板的系统总线相连接。",
    options: [
      { label: "A", text: "适配器" },
      { label: "B", text: "设备控制器" },
      { label: "C", text: "计数器" },
      { label: "D", text: "寄存器" }
    ],
    answer: "A",
    id: "计组选择-48"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 49,
    type: "single",
    text: "DMA 是在哪两个设备之间建立的直接数据通路。",
    options: [
      { label: "A", text: "CPU 与外设" },
      { label: "B", text: "主存与外设" },
      { label: "C", text: "外设与外设" },
      { label: "D", text: "CPU 与主存" }
    ],
    answer: "B",
    id: "计组选择-49"
  },
  {
    source: "计算机组成原理练习题",
    source_stem: "计组选择",
    topic: "计算机组成原理",
    number: 50,
    type: "single",
    text: "DMA 数据的传送是以什么为单位进行的。",
    options: [
      { label: "A", text: "字节" },
      { label: "B", text: "字" },
      { label: "C", text: "数据块" },
      { label: "D", text: "位" }
    ],
    answer: "C",
    id: "计组选择-50"
  }
];
