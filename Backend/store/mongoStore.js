import mongoose from "mongoose";
import { MODELS, Counter } from "../models/index.js";
import { HttpError } from "../../shared/routes/util.js";

// Documents leave the store as plain JSON: ids are strings and dates are ISO strings,
// exactly like the in-memory store used by the browser preview.
function plain(doc) {
    if (doc == null) return doc;
    const out = JSON.parse(JSON.stringify(doc));
    if (Array.isArray(out)) out.forEach((d) => delete d.__v);
    else delete out.__v;
    return out;
}

function translate(err) {
    if (err instanceof HttpError) return err;
    if (err?.code === 11000) return new HttpError(409, 'That record already exists');
    if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) return new HttpError(400, err.message);
    return err;
}

// Async document store with the same interface as shared/memoryStore.js, backed by Mongoose.
export function createMongoStore() {
    const model = (col) => {
        const m = MODELS[col];
        if (!m) throw new Error(`Unknown collection ${col}`);
        return m;
    };
    const guard = async (fn) => {
        try {
            return await fn();
        } catch (err) {
            throw translate(err);
        }
    };
    const okId = (id) => mongoose.Types.ObjectId.isValid(id);
    return {
        find: (col, filter = {}, { sort, skip = 0, limit = 0 } = {}) =>
            guard(async () => {
                let q = model(col).find(filter);
                if (sort) q = q.sort(sort);
                if (skip) q = q.skip(skip);
                if (limit) q = q.limit(limit);
                return plain(await q.lean());
            }),
        count: (col, filter = {}) => guard(() => model(col).countDocuments(filter)),
        get: (col, id) => guard(async () => (okId(id) ? plain(await model(col).findById(id).lean()) : null)),
        insert: (col, doc) => guard(async () => plain((await model(col).create(doc)).toObject())),
        insertMany: (col, docs) => guard(async () => { await model(col).insertMany(docs); }),
        update: (col, id, patch) =>
            guard(async () => (okId(id) ? plain(await model(col).findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean()) : null)),
        updateMany: (col, filter, patch) => guard(async () => (await model(col).updateMany(filter, { $set: patch })).modifiedCount),
        remove: (col, id) => guard(async () => (okId(id) ? plain(await model(col).findByIdAndDelete(id).lean()) : null)),
        removeMany: (col, filter) => guard(async () => (await model(col).deleteMany(filter)).deletedCount),
        nextSeq: (name) => guard(async () => (await Counter.findOneAndUpdate({ name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' }).lean()).value),
    };
}
