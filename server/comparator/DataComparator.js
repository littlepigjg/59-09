const DataGenerator = require('../generator/DataGenerator');
const ModelParser = require('../models/ModelParser');

class DataComparator {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 100;
    this.includeChanges = options.includeChanges !== false;
    this.maxChanges = options.maxChanges || 1000;
    this.modelParser = new ModelParser();
  }

  deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  compareObjects(obj1, obj2, prefix = '') {
    const changes = [];
    const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val1 = obj1 ? obj1[key] : undefined;
      const val2 = obj2 ? obj2[key] : undefined;

      if (val1 === undefined && val2 !== undefined) {
        changes.push({
          field: path,
          type: 'added',
          oldValue: undefined,
          newValue: val2
        });
      } else if (val2 === undefined && val1 !== undefined) {
        changes.push({
          field: path,
          type: 'removed',
          oldValue: val1,
          newValue: undefined
        });
      } else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
        if (Array.isArray(val1) || Array.isArray(val2)) {
          if (!this.deepEqual(val1, val2)) {
            changes.push({
              field: path,
              type: 'modified',
              oldValue: val1,
              newValue: val2
            });
          }
        } else {
          changes.push(...this.compareObjects(val1, val2, path));
        }
      } else if (!this.deepEqual(val1, val2)) {
        changes.push({
          field: path,
          type: 'modified',
          oldValue: val1,
          newValue: val2
        });
      }
    }

    return changes;
  }

  compareRows(row1, row2, rowIndex) {
    const changes = this.compareObjects(row1, row2);
    return {
      rowIndex,
      hasChanges: changes.length > 0,
      changes: changes.length > 0 ? changes : undefined
    };
  }

  compareDatasets(data1, data2, options = {}) {
    const includeChanges = options.includeChanges !== false;
    const maxChanges = options.maxChanges || this.maxChanges;

    const fieldStats = {};
    const result = {
      totalRows: Math.max(data1.length, data2.length),
      matchedRows: Math.min(data1.length, data2.length),
      changedRows: 0,
      unchangedRows: 0,
      onlyInFirst: 0,
      onlyInSecond: 0,
      totalChanges: 0,
      fieldStats,
      changes: includeChanges ? [] : undefined,
      sampleChanges: []
    };

    const minLen = Math.min(data1.length, data2.length);
    const maxLen = Math.max(data1.length, data2.length);

    result.onlyInFirst = Math.max(0, data1.length - data2.length);
    result.onlyInSecond = Math.max(0, data2.length - data1.length);

    const allFields = new Set();
    for (let i = 0; i < minLen; i++) {
      if (data1[i]) Object.keys(data1[i]).forEach(k => allFields.add(k));
      if (data2[i]) Object.keys(data2[i]).forEach(k => allFields.add(k));
    }
    allFields.forEach(field => {
      fieldStats[field] = {
        field,
        changedCount: 0,
        unchangedCount: 0,
        changeRate: 0,
        sampleValues: []
      };
    });

    for (let i = 0; i < minLen; i++) {
      const rowResult = this.compareRows(data1[i], data2[i], i);

      if (rowResult.hasChanges) {
        result.changedRows++;
        result.totalChanges += rowResult.changes.length;

        rowResult.changes.forEach(change => {
          const field = change.field.split('.')[0];
          if (fieldStats[field]) {
            fieldStats[field].changedCount++;
            if (fieldStats[field].sampleValues.length < 5) {
              fieldStats[field].sampleValues.push({
                rowIndex: i,
                oldValue: change.oldValue,
                newValue: change.newValue
              });
            }
          }
        });

        if (includeChanges && result.changes.length < maxChanges) {
          result.changes.push(rowResult);
        }
        if (result.sampleChanges.length < 10) {
          result.sampleChanges.push(rowResult);
        }
      } else {
        result.unchangedRows++;
        Object.keys(data1[i] || {}).forEach(field => {
          if (fieldStats[field]) {
            fieldStats[field].unchangedCount++;
          }
        });
      }
    }

    Object.keys(fieldStats).forEach(field => {
      const stat = fieldStats[field];
      const total = stat.changedCount + stat.unchangedCount;
      stat.changeRate = total > 0 ? Number((stat.changedCount / total * 100).toFixed(2)) : 0;
      stat.totalCount = total;
    });

    result.unchangedFields = Object.keys(fieldStats).filter(f => fieldStats[f].changeRate === 0);
    result.alwaysChangedFields = Object.keys(fieldStats).filter(f => fieldStats[f].changeRate === 100);

    return result;
  }

  async compareBySeeds(model, seed1, seed2, count, options = {}) {
    const chunkSize = options.chunkSize || this.chunkSize;
    const includeChanges = options.includeChanges !== false;
    const maxChanges = options.maxChanges || this.maxChanges;
    const onProgress = options.onProgress;

    const parsedModel = typeof model === 'string' ? this.modelParser.parse(model) : model;
    const generator1 = new DataGenerator(seed1);
    const generator2 = new DataGenerator(seed2);

    const fieldStats = {};
    const result = {
      totalRows: count,
      matchedRows: count,
      changedRows: 0,
      unchangedRows: 0,
      onlyInFirst: 0,
      onlyInSecond: 0,
      totalChanges: 0,
      fieldStats,
      changes: includeChanges ? [] : undefined,
      sampleChanges: [],
      seeds: {
        seed1: generator1.getSeed(),
        seed2: generator2.getSeed()
      }
    };

    const firstChunk = generator1.generateWithSkipLimit(parsedModel, 0, Math.min(chunkSize, count), { total: count });
    const allFields = new Set();
    firstChunk.data.forEach(row => Object.keys(row).forEach(k => allFields.add(k)));
    allFields.forEach(field => {
      fieldStats[field] = {
        field,
        changedCount: 0,
        unchangedCount: 0,
        changeRate: 0,
        sampleValues: []
      };
    });

    let processed = 0;
    for (let skip = 0; skip < count; skip += chunkSize) {
      const limit = Math.min(chunkSize, count - skip);

      const chunk1 = generator1.generateWithSkipLimit(parsedModel, skip, limit, { total: count });
      const chunk2 = generator2.generateWithSkipLimit(parsedModel, skip, limit, { total: count });

      const chunkResult = this.compareDatasets(chunk1.data, chunk2.data, {
        includeChanges,
        maxChanges: maxChanges - (result.changes ? result.changes.length : 0)
      });

      result.changedRows += chunkResult.changedRows;
      result.unchangedRows += chunkResult.unchangedRows;
      result.totalChanges += chunkResult.totalChanges;

      Object.keys(fieldStats).forEach(field => {
        if (chunkResult.fieldStats[field]) {
          fieldStats[field].changedCount += chunkResult.fieldStats[field].changedCount;
          fieldStats[field].unchangedCount += chunkResult.fieldStats[field].unchangedCount;
          if (fieldStats[field].sampleValues.length < 5 && chunkResult.fieldStats[field].sampleValues.length > 0) {
            const samples = chunkResult.fieldStats[field].sampleValues.map(s => ({
              ...s,
              rowIndex: s.rowIndex + skip
            }));
            fieldStats[field].sampleValues.push(...samples.slice(0, 5 - fieldStats[field].sampleValues.length));
          }
        }
      });

      if (includeChanges && result.changes.length < maxChanges && chunkResult.changes) {
        const adjustedChanges = chunkResult.changes.map(c => ({
          ...c,
          rowIndex: c.rowIndex + skip
        }));
        result.changes.push(...adjustedChanges.slice(0, maxChanges - result.changes.length));
      }

      if (result.sampleChanges.length < 10 && chunkResult.sampleChanges.length > 0) {
        const adjustedSamples = chunkResult.sampleChanges.map(c => ({
          ...c,
          rowIndex: c.rowIndex + skip
        }));
        result.sampleChanges.push(...adjustedSamples.slice(0, 10 - result.sampleChanges.length));
      }

      processed += limit;
      if (onProgress) {
        onProgress({
          processed,
          total: count,
          percentage: Number((processed / count * 100).toFixed(1))
        });
      }

      await new Promise(resolve => setImmediate(resolve));
    }

    Object.keys(fieldStats).forEach(field => {
      const stat = fieldStats[field];
      const total = stat.changedCount + stat.unchangedCount;
      stat.changeRate = total > 0 ? Number((stat.changedCount / total * 100).toFixed(2)) : 0;
      stat.totalCount = total;
    });

    result.unchangedFields = Object.keys(fieldStats).filter(f => fieldStats[f].changeRate === 0);
    result.alwaysChangedFields = Object.keys(fieldStats).filter(f => fieldStats[f].changeRate === 100);

    return result;
  }

  async *compareBySeedsStream(model, seed1, seed2, count, options = {}) {
    const chunkSize = options.chunkSize || this.chunkSize;

    const parsedModel = typeof model === 'string' ? this.modelParser.parse(model) : model;
    const generator1 = new DataGenerator(seed1);
    const generator2 = new DataGenerator(seed2);

    for (let skip = 0; skip < count; skip += chunkSize) {
      const limit = Math.min(chunkSize, count - skip);

      const chunk1 = generator1.generateWithSkipLimit(parsedModel, skip, limit, { total: count });
      const chunk2 = generator2.generateWithSkipLimit(parsedModel, skip, limit, { total: count });

      const rowResults = [];
      for (let i = 0; i < chunk1.data.length; i++) {
        const rowResult = this.compareRows(chunk1.data[i], chunk2.data[i], skip + i);
        rowResults.push(rowResult);
      }

      yield {
        skip,
        limit,
        processed: skip + limit,
        total: count,
        percentage: Number(((skip + limit) / count * 100).toFixed(1)),
        rows: rowResults
      };
    }

    return {
      completed: true,
      total: count
    };
  }
}

module.exports = DataComparator;
