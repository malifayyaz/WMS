const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");
const RawMaterial = require("../models/RawMaterial");
const ReadyStock = require("../models/ReadyStock");
const AnnealingRecord = require("../models/AnnealingRecord");
const JobWork = require("../models/JobWork");
const WorkerLedgerEntry = require("../models/WorkerLedgerEntry");

const {
  recalcCustomerTotals,
  recalcSupplierTotals,
  deleteTransactionsForSource,
} = require("./transactionSyncService");
const { restoreStockByCategory, refreshLowStockAlerts } = require("./stockService");
const { releaseAnnealingForSale } = require("../controllers/annealingController");

/**
 * Undo a previously executed AI agent action.
 * @param {string} model
 * @param {string} id
 * @param {object} [extra] optional undo metadata (e.g. deliveryId)
 */
async function undoAction(model, id, extra = {}) {
  try {
    if (!model || !id) {
      return { success: false, message: "model and id are required" };
    }

    switch (model) {
      case "Order": {
        const order = await Order.findById(id);
        if (!order) return { success: false, message: "Order not found" };

        if (order.coilCategory && order.stockDeductedKg > 0) {
          await restoreStockByCategory(order.coilCategory, order.stockDeductedKg);
        }
        await deleteTransactionsForSource("Order", order._id);
        await releaseAnnealingForSale(order._id);
        const customerId = order.customerId;
        await Order.findByIdAndDelete(order._id);
        if (customerId) await recalcCustomerTotals(customerId);

        return { success: true, message: "Order deleted and stock restored" };
      }

      case "Transaction": {
        const transaction = await Transaction.findById(id);
        if (!transaction) return { success: false, message: "Transaction not found" };

        const relatedTo = transaction.relatedTo;
        const relatedId = transaction.relatedId;

        if (transaction.linkedExpenseId) {
          await Expense.findByIdAndDelete(transaction.linkedExpenseId);
        }

        await Transaction.findByIdAndDelete(transaction._id);

        if (relatedTo === "Customer" && relatedId) {
          await recalcCustomerTotals(relatedId);
        }
        if (relatedTo === "Supplier" && relatedId) {
          await recalcSupplierTotals(relatedId);
        }

        return { success: true, message: "Transaction deleted" };
      }

      case "RawMaterial": {
        const rawMaterial = await RawMaterial.findById(id);
        if (!rawMaterial) return { success: false, message: "Purchase not found" };

        const supplierId = rawMaterial.supplierId;
        const coilCategory = rawMaterial.coilCategory;
        await deleteTransactionsForSource("RawMaterial", rawMaterial._id);
        await RawMaterial.findByIdAndDelete(rawMaterial._id);
        if (supplierId) await recalcSupplierTotals(supplierId);
        if (coilCategory) await refreshLowStockAlerts(coilCategory);

        return { success: true, message: "Purchase deleted" };
      }

      case "Expense": {
        const expense = await Expense.findById(id);
        if (!expense) return { success: false, message: "Expense not found" };

        if (expense.bankTransactionId) {
          await Transaction.findByIdAndDelete(expense.bankTransactionId);
        }
        await deleteTransactionsForSource("Expense", expense._id);
        await Expense.findByIdAndDelete(expense._id);

        return { success: true, message: "Expense deleted" };
      }

      case "AnnealingRecord": {
        const record = await AnnealingRecord.findById(id);
        if (!record) return { success: false, message: "Annealing record not found" };

        // Remove Patri stock rows created from this arrival (notes contain arrival id)
        if (record.entryType === "Arrival") {
          await RawMaterial.deleteMany({
            notes: new RegExp(`From annealing arrival ${record._id}`),
          });
        }

        await AnnealingRecord.findByIdAndDelete(id);
        return { success: true, message: "Annealing record deleted" };
      }

      case "Customer": {
        const customer = await Customer.findById(id);
        if (!customer) return { success: false, message: "Customer not found" };

        const [orderCount, jobCount, txnCount] = await Promise.all([
          Order.countDocuments({ customerId: customer._id }),
          JobWork.countDocuments({ customerId: customer._id }),
          Transaction.countDocuments({ relatedTo: "Customer", relatedId: customer._id }),
        ]);
        if (orderCount || jobCount || txnCount) {
          return {
            success: false,
            message: "Cannot undo customer — related records already exist",
          };
        }

        await Customer.findByIdAndDelete(id);
        return { success: true, message: "Customer deleted" };
      }

      case "Supplier": {
        const supplier = await Supplier.findById(id);
        if (!supplier) return { success: false, message: "Supplier not found" };

        const [purchaseCount, txnCount] = await Promise.all([
          RawMaterial.countDocuments({ supplierId: supplier._id }),
          Transaction.countDocuments({ relatedTo: "Supplier", relatedId: supplier._id }),
        ]);
        if (purchaseCount || txnCount) {
          return {
            success: false,
            message: "Cannot undo supplier — related records already exist",
          };
        }

        await Supplier.findByIdAndDelete(id);
        return { success: true, message: "Supplier deleted" };
      }

      case "ReadyStock": {
        const readyStock = await ReadyStock.findByIdAndDelete(id);
        if (!readyStock) return { success: false, message: "Ready stock entry not found" };
        return { success: true, message: "Ready stock entry deleted" };
      }

      case "WorkerLedgerEntry": {
        const entry = await WorkerLedgerEntry.findById(id);
        if (!entry) return { success: false, message: "Worker payment not found" };

        if (entry.expenseId) {
          await Expense.findByIdAndDelete(entry.expenseId);
        }
        await WorkerLedgerEntry.findByIdAndDelete(entry._id);

        return { success: true, message: "Worker payment deleted" };
      }

      case "JobWork": {
        const jobWork = await JobWork.findById(id);
        if (!jobWork) return { success: false, message: "Job work not found" };

        if (!jobWork.deliveries || jobWork.deliveries.length === 0) {
          return { success: false, message: "No processing delivery to undo" };
        }

        const deliveryId = extra.deliveryId;
        if (deliveryId) {
          const delivery = jobWork.deliveries.id(deliveryId);
          if (!delivery) {
            return { success: false, message: "Processing delivery not found to undo" };
          }
          const groupId = delivery.deliveryGroupId;
          if (groupId) {
            const victims = jobWork.deliveries.filter(
              (d) => String(d.deliveryGroupId) === String(groupId)
            );
            victims.forEach((d) => d.deleteOne());
          } else {
            delivery.deleteOne();
          }
        } else {
          // Legacy undoInfo without deliveryId — only safe if single delivery
          if (jobWork.deliveries.length !== 1) {
            return {
              success: false,
              message: "Cannot undo — delivery id missing and multiple deliveries exist",
            };
          }
          jobWork.deliveries[0].deleteOne();
        }

        await jobWork.save();
        if (jobWork.customerId) await recalcCustomerTotals(jobWork.customerId);

        return { success: true, message: "Processing delivery deleted" };
      }

      default:
        return { success: false, message: `Unknown model: ${model}` };
    }
  } catch (error) {
    console.error("undoAction error:", error);
    return { success: false, message: error.message || "Undo failed" };
  }
}

module.exports = { undoAction };
