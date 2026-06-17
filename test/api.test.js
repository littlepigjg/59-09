const testModel = {
  name: '用户',
  fields: [
    { name: 'id', type: 'number', label: 'ID', rule: { min: 1, max: 99999, decimal: 0 }, nullable: false, nullProbability: 0 },
    { name: 'name', type: 'string', label: '姓名', rule: { format: 'chineseName', minLength: 1, maxLength: 20 }, nullable: false, nullProbability: 0 },
    { name: 'email', type: 'string', label: '邮箱', rule: { format: 'email' }, nullable: false, nullProbability: 0 },
    { name: 'age', type: 'number', label: '年龄', rule: { min: 18, max: 65, decimal: 0 }, nullable: false, nullProbability: 0 }
  ]
};

async function testApiCompare() {
  console.log('\n=== 测试 POST /api/compare ===');
  try {
    const data1 = [
      { id: 1, name: '张三', age: 25 },
      { id: 2, name: '李四', age: 30 }
    ];
    const data2 = [
      { id: 1, name: '张三三', age: 25 },
      { id: 2, name: '李四', age: 31 }
    ];

    const response = await fetch('http://localhost:3000/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data1, data2 })
    });

    const result = await response.json();
    console.log('成功:', result.success);
    console.log('总行数:', result.data.totalRows);
    console.log('变化行数:', result.data.changedRows);
    console.log('变化次数:', result.data.totalChanges);
    console.log('✓ API /compare 测试通过');
    return true;
  } catch (error) {
    console.log('✗ API /compare 测试失败:', error.message);
    return false;
  }
}

async function testApiCompareSeeds() {
  console.log('\n=== 测试 POST /api/compare/seeds ===');
  try {
    const startTime = Date.now();
    const response = await fetch('http://localhost:3000/api/compare/seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: testModel,
        seed1: 12345,
        seed2: 54321,
        count: 1000,
        chunkSize: 100
      })
    });

    const result = await response.json();
    const duration = (Date.now() - startTime) / 1000;

    console.log('成功:', result.success);
    console.log('总行数:', result.data.totalRows);
    console.log('变化行数:', result.data.changedRows);
    console.log('不变行数:', result.data.unchangedRows);
    console.log('变化次数:', result.data.totalChanges);
    console.log('不变字段:', result.data.unchangedFields);
    console.log('耗时:', duration.toFixed(2) + 's');
    console.log('✓ API /compare/seeds 测试通过');
    return true;
  } catch (error) {
    console.log('✗ API /compare/seeds 测试失败:', error.message);
    return false;
  }
}

async function testApiLargeData() {
  console.log('\n=== 测试 POST /api/compare/seeds (大数据量 10万条) ===');
  try {
    const startTime = Date.now();
    const response = await fetch('http://localhost:3000/api/compare/seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: testModel,
        seed1: 12345,
        seed2: 54321,
        count: 100000,
        chunkSize: 1000,
        includeChanges: false
      })
    });

    const result = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    const throughput = (100000 / duration).toFixed(0);

    console.log('成功:', result.success);
    console.log('总行数:', result.data.totalRows.toLocaleString());
    console.log('变化行数:', result.data.changedRows.toLocaleString());
    console.log('变化次数:', result.data.totalChanges.toLocaleString());
    console.log('耗时:', duration.toFixed(2) + 's');
    console.log('吞吐量:', throughput + ' 条/秒');
    console.log('包含变化详情:', result.data.changes === undefined);
    console.log('✓ API /compare/seeds 大数据量测试通过');
    return true;
  } catch (error) {
    console.log('✗ API /compare/seeds 大数据量测试失败:', error.message);
    return false;
  }
}

async function testApiStream() {
  console.log('\n=== 测试 POST /api/compare/stream (SSE流式) ===');
  return new Promise((resolve) => {
    try {
      const modelStr = encodeURIComponent(JSON.stringify(testModel));
      const url = `http://localhost:3000/api/compare/stream?model=${modelStr}&seed1=12345&seed2=54321&count=1000&chunkSize=200`;

      const { EventSource } = require('eventsource');
      const eventSource = new EventSource(url);

      let chunkCount = 0;
      const startTime = Date.now();

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.done) {
          const duration = (Date.now() - startTime) / 1000;
          console.log('接收块数:', chunkCount);
          console.log('耗时:', duration.toFixed(2) + 's');
          console.log('✓ API /compare/stream 测试通过');
          eventSource.close();
          resolve(true);
          return;
        }

        if (data.error) {
          console.log('✗ API /compare/stream 测试失败:', data.error);
          eventSource.close();
          resolve(false);
          return;
        }

        chunkCount++;
        const changedCount = data.rows.filter(r => r.hasChanges).length;
        console.log(`  块 ${chunkCount}: ${data.processed}/${data.total} (${data.percentage}%), 变化: ${changedCount}/${data.rows.length}`);
      };

      eventSource.onerror = (error) => {
        console.log('✗ API /compare/stream 测试失败:', error.message || '连接错误');
        eventSource.close();
        resolve(false);
      };

      setTimeout(() => {
        console.log('✗ API /compare/stream 测试超时');
        eventSource.close();
        resolve(false);
      }, 30000);

    } catch (error) {
      console.log('✗ API /compare/stream 测试失败:', error.message);
      resolve(false);
    }
  });
}

async function runAllApiTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              API 接口集成测试                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = [];

  results.push(await testApiCompare());
  results.push(await testApiCompareSeeds());
  results.push(await testApiLargeData());

  try {
    require.resolve('eventsource');
    results.push(await testApiStream());
  } catch (e) {
    console.log('\n⚠️  跳过 SSE 流式测试 (eventsource 模块未安装)');
    console.log('   可运行: npm install eventsource --save-dev 后重新测试');
  }

  console.log('\n════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`API测试完成: ${passed}/${total} 通过`);

  if (passed === total) {
    console.log('🎉 所有API测试通过！');
    process.exit(0);
  } else {
    console.log(`❌ ${total - passed} 个API测试失败`);
    process.exit(1);
  }
}

runAllApiTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
