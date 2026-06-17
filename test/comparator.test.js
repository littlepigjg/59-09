const DataComparator = require('../server/comparator/DataComparator');
const DataGenerator = require('../server/generator/DataGenerator');
const ModelParser = require('../server/models/ModelParser');

const modelParser = new ModelParser();
const dataComparator = new DataComparator({ chunkSize: 10 });

const testModel = {
  name: '用户',
  fields: [
    { name: 'id', type: 'number', label: 'ID', rule: { min: 1, max: 99999, decimal: 0 }, nullable: false, nullProbability: 0 },
    { name: 'name', type: 'string', label: '姓名', rule: { format: 'chineseName', minLength: 1, maxLength: 20 }, nullable: false, nullProbability: 0 },
    { name: 'email', type: 'string', label: '邮箱', rule: { format: 'email' }, nullable: false, nullProbability: 0 },
    { name: 'age', type: 'number', label: '年龄', rule: { min: 18, max: 65, decimal: 0 }, nullable: false, nullProbability: 0 }
  ]
};

async function testDeepEqual() {
  console.log('\n=== 测试 deepEqual 方法 ===');

  const tests = [
    { a: 1, b: 1, expected: true, desc: '相同数字' },
    { a: 1, b: 2, expected: false, desc: '不同数字' },
    { a: 'hello', b: 'hello', expected: true, desc: '相同字符串' },
    { a: 'hello', b: 'world', expected: false, desc: '不同字符串' },
    { a: null, b: null, expected: true, desc: 'null相等' },
    { a: null, b: undefined, expected: false, desc: 'null vs undefined' },
    { a: true, b: true, expected: true, desc: '相同布尔值' },
    { a: [1, 2, 3], b: [1, 2, 3], expected: true, desc: '相同数组' },
    { a: [1, 2, 3], b: [1, 3, 2], expected: false, desc: '不同顺序数组' },
    { a: { x: 1, y: 2 }, b: { x: 1, y: 2 }, expected: true, desc: '相同对象' },
    { a: { x: 1, y: 2 }, b: { x: 1, y: 3 }, expected: false, desc: '不同对象' },
    { a: { x: { y: 1 } }, b: { x: { y: 1 } }, expected: true, desc: '嵌套对象' }
  ];

  let passed = 0;
  for (const test of tests) {
    const result = dataComparator.deepEqual(test.a, test.b);
    const status = result === test.expected ? '✓' : '✗';
    if (result === test.expected) passed++;
    console.log(`${status} ${test.desc}: ${result} (expected: ${test.expected})`);
  }
  console.log(`通过: ${passed}/${tests.length}`);
  return passed === tests.length;
}

function testCompareObjects() {
  console.log('\n=== 测试 compareObjects 方法 ===');

  const obj1 = { id: 1, name: '张三', age: 25, address: { city: '北京', street: '长安街' } };
  const obj2 = { id: 1, name: '李四', age: 25, email: 'test@example.com', address: { city: '上海', street: '长安街' } };

  const changes = dataComparator.compareObjects(obj1, obj2);
  console.log('对比结果:', JSON.stringify(changes, null, 2));

  const expectedTypes = ['modified', 'modified', 'added'];
  const actualTypes = changes.map(c => c.type).sort();
  const passed = actualTypes.length === 3 &&
    actualTypes.includes('modified') &&
    actualTypes.includes('added');

  console.log(`变化数量: ${changes.length} (expected: 3)`);
  console.log(`包含新增字段: ${changes.some(c => c.field === 'email')}`);
  console.log(`包含嵌套变化: ${changes.some(c => c.field === 'address.city')}`);
  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

function testCompareDatasets() {
  console.log('\n=== 测试 compareDatasets 方法 ===');

  const data1 = [
    { id: 1, name: '张三', age: 25 },
    { id: 2, name: '李四', age: 30 },
    { id: 3, name: '王五', age: 35 }
  ];

  const data2 = [
    { id: 1, name: '张三三', age: 25 },
    { id: 2, name: '李四', age: 30 },
    { id: 3, name: '王五', age: 36 },
    { id: 4, name: '赵六', age: 40 }
  ];

  const result = dataComparator.compareDatasets(data1, data2);
  console.log('对比结果:');
  console.log('  总行数:', result.totalRows);
  console.log('  变化行数:', result.changedRows);
  console.log('  不变行数:', result.unchangedRows);
  console.log('  仅在数据集1:', result.onlyInFirst);
  console.log('  仅在数据集2:', result.onlyInSecond);
  console.log('  总变化次数:', result.totalChanges);
  console.log('  不变字段:', result.unchangedFields);
  console.log('  每次都变的字段:', result.alwaysChangedFields);
  console.log('  字段统计:', JSON.stringify(result.fieldStats, null, 2));

  const passed =
    result.totalRows === 4 &&
    result.changedRows === 2 &&
    result.unchangedRows === 1 &&
    result.onlyInFirst === 0 &&
    result.onlyInSecond === 1 &&
    result.totalChanges >= 2 &&
    result.unchangedFields.includes('id') &&
    result.fieldStats.name.changeRate > 0;

  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

async function testCompareBySeeds() {
  console.log('\n=== 测试 compareBySeeds 方法（分块对比）===');

  const seed1 = 12345;
  const seed2 = 54321;
  const count = 100;

  let progressCount = 0;
  const result = await dataComparator.compareBySeeds(testModel, seed1, seed2, count, {
    chunkSize: 20,
    includeChanges: true,
    onProgress: (progress) => {
      progressCount++;
      console.log(`  进度: ${progress.processed}/${progress.total} (${progress.percentage}%)`);
    }
  });

  console.log('对比结果:');
  console.log('  种子1:', result.seeds.seed1);
  console.log('  种子2:', result.seeds.seed2);
  console.log('  总行数:', result.totalRows);
  console.log('  变化行数:', result.changedRows);
  console.log('  不变行数:', result.unchangedRows);
  console.log('  总变化次数:', result.totalChanges);
  console.log('  进度回调次数:', progressCount);
  console.log('  字段统计:');
  for (const field in result.fieldStats) {
    const stat = result.fieldStats[field];
    console.log(`    ${field}: ${stat.changeRate}% (${stat.changedCount}/${stat.totalCount})`);
  }

  const passed =
    result.totalRows === count &&
    result.changedRows + result.unchangedRows === count &&
    result.totalChanges > 0 &&
    progressCount > 0 &&
    result.seeds.seed1 === seed1 &&
    result.seeds.seed2 === seed2;

  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

async function testStreamCompare() {
  console.log('\n=== 测试 compareBySeedsStream 方法（流式对比）===');

  const seed1 = 12345;
  const seed2 = 54321;
  const count = 50;
  const chunkSize = 10;

  const stream = dataComparator.compareBySeedsStream(testModel, seed1, seed2, count, { chunkSize });

  let chunkCount = 0;
  let totalProcessed = 0;
  let totalChanged = 0;

  for await (const chunk of stream) {
    chunkCount++;
    totalProcessed = chunk.processed;
    const changedInChunk = chunk.rows.filter(r => r.hasChanges).length;
    totalChanged += changedInChunk;
    console.log(`  块 ${chunkCount}: ${chunk.processed}/${chunk.total} (${chunk.percentage}%), 变化: ${changedInChunk}/${chunk.rows.length}`);
  }

  const expectedChunks = Math.ceil(count / chunkSize);
  const passed =
    chunkCount === expectedChunks &&
    totalProcessed === count &&
    totalChanged > 0;

  console.log(`  总块数: ${chunkCount} (expected: ${expectedChunks})`);
  console.log(`  总处理行数: ${totalProcessed} (expected: ${count})`);
  console.log(`  总变化行数: ${totalChanged}`);
  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

function testSameSeed() {
  console.log('\n=== 测试相同种子对比 ===');

  const seed = 12345;
  const generator = new DataGenerator(seed);
  const parsedModel = modelParser.parse(testModel);

  const data1 = generator.generate(parsedModel, 50);
  const data2 = generator.generate(parsedModel, 50);

  const result = dataComparator.compareDatasets(data1, data2);

  console.log('对比结果:');
  console.log('  总行数:', result.totalRows);
  console.log('  变化行数:', result.changedRows);
  console.log('  不变行数:', result.unchangedRows);
  console.log('  总变化次数:', result.totalChanges);
  console.log('  不变字段:', result.unchangedFields);

  const passed =
    result.changedRows === 0 &&
    result.unchangedRows === 50 &&
    result.totalChanges === 0 &&
    result.unchangedFields.length === testModel.fields.length;

  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

function testDifferentSeeds() {
  console.log('\n=== 测试不同种子对比 ===');

  const generator1 = new DataGenerator(12345);
  const generator2 = new DataGenerator(54321);
  const parsedModel = modelParser.parse(testModel);

  const data1 = generator1.generate(parsedModel, 100);
  const data2 = generator2.generate(parsedModel, 100);

  const result = dataComparator.compareDatasets(data1, data2, { includeChanges: false });

  console.log('对比结果:');
  console.log('  总行数:', result.totalRows);
  console.log('  变化行数:', result.changedRows);
  console.log('  不变行数:', result.unchangedRows);
  console.log('  总变化次数:', result.totalChanges);
  console.log('  包含详细变化:', result.changes === undefined);

  const passed =
    result.changedRows > 0 &&
    result.changedRows + result.unchangedRows === 100 &&
    result.totalChanges > 0 &&
    result.changes === undefined;

  console.log(`测试结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  return passed;
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           DataComparator 单元测试                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = [];

  results.push(await testDeepEqual());
  results.push(testCompareObjects());
  results.push(testCompareDatasets());
  results.push(await testCompareBySeeds());
  results.push(await testStreamCompare());
  results.push(testSameSeed());
  results.push(testDifferentSeeds());

  console.log('\n════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`测试完成: ${passed}/${total} 通过`);

  if (passed === total) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log(`❌ ${total - passed} 个测试失败`);
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
