import Stripe from "../config/stripe.js";
import CartProductModel from "../models/cartproduct.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js";
import mongoose from "mongoose";

export const pricewithDiscount = (price, dis = 1) => {
  const discountAmout = Math.ceil((Number(price) * Number(dis)) / 100);
  const actualPrice = Number(price) - Number(discountAmout);
  return actualPrice;
};

// Cash on Delivery Order (with transaction)
export async function CashOnDeliveryOrderController(request, response) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = request.userId;
    const { list_items, addressId, deliveryCharge } = request.body;

    const orderId = `ORD-${new mongoose.Types.ObjectId()}`;

    // Calculate order subtotal
    const orderSubTotal = list_items.reduce((sum, item) => {
      const priceAfterDiscount = pricewithDiscount(
        item.productId.price,
        item.productId.discount,
      );
      return sum + priceAfterDiscount * item.quantity;
    }, 0);

    const correctOrderTotal = orderSubTotal + (deliveryCharge || 0);

    // Check and decrease stock for each product
    for (const item of list_items) {
      const product = await ProductModel.findById(item.productId._id).session(
        session,
      );

      if (!product) {
        throw new Error(`Product ${item.productId.name} not found`);
      }

      if (product.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.productId.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
        );
      }

      // Decrease stock
      product.stock -= item.quantity;
      await product.save({ session });
    }

    // Create order items
    const orderItems = list_items.map((el) => {
      const priceAfterDiscount = pricewithDiscount(
        el.productId.price,
        el.productId.discount,
      );

      return {
        userId: userId,
        orderId: orderId,
        productId: el.productId._id,
        product_details: {
          name: el.productId.name,
          image: el.productId.image,
          price: el.productId.price,
          discount: el.productId.discount,
          unit: el.productId.unit,
        },
        quantity: el.quantity,
        itemSubTotal: priceAfterDiscount * el.quantity,
        paymentId: "",
        payment_status: "CASH ON DELIVERY",
        delivery_address: addressId,
        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge || 0,
        orderTotal: correctOrderTotal,
      };
    });

    const generatedOrder = await OrderModel.insertMany(orderItems, { session });

    // Clear cart
    await CartProductModel.deleteMany({ userId: userId }, { session });
    await UserModel.updateOne(
      { _id: userId },
      { shopping_cart: [] },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return response.json({
      message: "Order placed successfully",
      error: false,
      success: true,
      data: {
        orderId: orderId,
        items: generatedOrder,
        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge,
        orderTotal: correctOrderTotal,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
}

// Create Stripe Payment Session
export async function paymentController(request, response) {
  try {
    const userId = request.userId;
    const { list_items, addressId, deliveryCharge } = request.body;

    if (!userId) {
      return response.status(400).json({
        message: "User ID is required",
        error: true,
        success: false,
      });
    }

    if (!list_items || !list_items.length) {
      return response.status(400).json({
        message: "No items in the order",
        error: true,
        success: false,
      });
    }

    if (!addressId) {
      return response.status(400).json({
        message: "Delivery address is required",
        error: true,
        success: false,
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return response.status(404).json({
        message: "User not found",
        error: true,
        success: false,
      });
    }

    // Check stock availability
    for (const item of list_items) {
      const product = await ProductModel.findById(item.productId._id);

      if (!product) {
        return response.status(404).json({
          message: `Product ${item.productId.name} not found`,
          error: true,
          success: false,
        });
      }

      if (product.stock < item.quantity) {
        return response.status(400).json({
          message: `Insufficient stock for ${item.productId.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
          error: true,
          success: false,
        });
      }
    }

    // Calculate order subtotal
    const calculatedSubTotal = list_items.reduce((sum, item) => {
      const priceAfterDiscount = pricewithDiscount(
        item.productId.price,
        item.productId.discount,
      );
      return sum + priceAfterDiscount * item.quantity;
    }, 0);

    const orderTotal = calculatedSubTotal + (deliveryCharge || 0);

    // Generate a unique order ID
    const orderId = `ORD-${new mongoose.Types.ObjectId()}`;

    // Prepare line items for Stripe
    const line_items = list_items.map((item) => {
      const priceAfterDiscount = pricewithDiscount(
        item.productId.price,
        item.productId.discount,
      );

      const unitAmount = Math.round(priceAfterDiscount * 100);

      return {
        price_data: {
          currency: "lkr",
          product_data: {
            name: item.productId.name,
            images: Array.isArray(item.productId.image)
              ? item.productId.image
              : [item.productId.image].filter(Boolean),
            metadata: {
              productId: item.productId._id.toString(),
              discount: item.productId.discount?.toString() || "0",
              unit: item.productId.unit || "piece",
              quantity: item.quantity.toString(),
            },
          },
          unit_amount: unitAmount,
        },
        quantity: item.quantity,
      };
    });

    // Create Stripe checkout session
    const params = {
      submit_type: "pay",
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      metadata: {
        userId: userId.toString(),
        addressId: addressId.toString(),
        deliveryCharge: deliveryCharge?.toString() || "0",
        orderTotal: orderTotal.toString(),
        calculatedSubTotal: calculatedSubTotal.toString(),
        orderId: orderId,
        itemCount: list_items.length.toString(),
        productDetails: JSON.stringify(
          list_items.map((item) => ({
            productId: item.productId._id.toString(),
            quantity: item.quantity,
            price: item.productId.price,
            discount: item.productId.discount || 0,
            name: item.productId.name,
            image: Array.isArray(item.productId.image)
              ? item.productId.image[0]
              : item.productId.image,
            unit: item.productId.unit || "piece",
          })),
        ),
      },
      line_items: line_items,
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      cancel_url: `${process.env.FRONTEND_URL}/cart`,
      shipping_address_collection: {
        allowed_countries: ["LK"],
      },
      phone_number_collection: {
        enabled: true,
      },
    };

    const session = await Stripe.checkout.sessions.create(params);

    return response.status(200).json({
      id: session.id,
      url: session.url,
      orderId: orderId,
      success: true,
      error: false,
    });
  } catch (error) {
    console.error("Payment controller error:", error);

    return response.status(500).json({
      message: error.message || "An error occurred while processing payment",
      error: true,
      success: false,
    });
  }
}

// Verify Payment and Save Order
export async function verifyPaymentAndSaveOrderController(request, response) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = request.userId;
    const { session_id, order_id } = request.body;

    if (!session_id || !order_id) {
      return response.status(400).json({
        message: "Session ID and Order ID are required",
        error: true,
        success: false,
      });
    }

    // Retrieve the Stripe session
    const stripeSession = await Stripe.checkout.sessions.retrieve(session_id);

    if (!stripeSession) {
      return response.status(404).json({
        message: "Payment session not found",
        error: true,
        success: false,
      });
    }

    // Check if payment was successful
    if (stripeSession.payment_status !== "paid") {
      return response.status(400).json({
        message: "Payment not completed",
        error: true,
        success: false,
      });
    }

    // Check if order already exists to prevent duplicates
    const existingOrder = await OrderModel.findOne({
      orderId: order_id,
    }).session(session);

    if (existingOrder) {
      await session.abortTransaction();
      session.endSession();

      return response.json({
        message: "Order already saved",
        error: false,
        success: true,
        data: existingOrder,
      });
    }

    // Parse product details
    const productDetails = JSON.parse(stripeSession.metadata.productDetails);
    const addressId = stripeSession.metadata.addressId;
    const deliveryCharge =
      parseFloat(stripeSession.metadata.deliveryCharge) || 0;
    const orderTotal = parseFloat(stripeSession.metadata.orderTotal);
    const orderSubTotal = parseFloat(stripeSession.metadata.calculatedSubTotal);

    // Get line items from Stripe
    const lineItems = await Stripe.checkout.sessions.listLineItems(session_id);

    // Check and decrease stock for each product
    for (const item of productDetails) {
      const product = await ProductModel.findById(item.productId).session(
        session,
      );

      if (!product) {
        throw new Error(`Product ${item.name} not found`);
      }

      if (product.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
        );
      }

      // Decrease stock
      product.stock -= item.quantity;
      await product.save({ session });
    }

    // Create order items
    const orderItems = productDetails.map((item) => {
      const priceAfterDiscount = pricewithDiscount(item.price, item.discount);

      // Find matching line item to get actual amount paid
      const lineItem = lineItems.data.find(
        (li) =>
          li.price.product === item.productId || li.description === item.name,
      );

      const itemSubTotal = lineItem
        ? lineItem.amount_total / 100
        : priceAfterDiscount * item.quantity;

      return {
        userId: userId,
        orderId: order_id,
        productId: item.productId,
        product_details: {
          name: item.name,
          image: [item.image],
          price: item.price,
          discount: item.discount,
          unit: item.unit,
        },
        quantity: item.quantity,
        itemSubTotal: itemSubTotal,
        paymentId: stripeSession.payment_intent,
        payment_status: "PAID",
        delivery_address: addressId,
        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge,
        orderTotal: orderTotal,
      };
    });

    // Insert order items
    const savedOrders = await OrderModel.insertMany(orderItems, { session });

    // Clear cart
    await CartProductModel.deleteMany({ userId: userId }, { session });
    await UserModel.updateOne(
      { _id: userId },
      { shopping_cart: [] },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return response.json({
      message: "Order saved successfully",
      error: false,
      success: true,
      data: {
        orderId: order_id,
        items: savedOrders,
        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge,
        orderTotal: orderTotal,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Verify payment error:", error);

    return response.status(500).json({
      message: error.message || "Failed to save order",
      error: true,
      success: false,
    });
  }
}

// Get order details
export async function getOrderDetailsController(request, response) {
  try {
    const userId = request.userId;

    const orderlist = await OrderModel.find({ userId: userId })
      .sort({ createdAt: -1 })
      .populate("delivery_address");

    return response.json({
      message: "order list",
      data: orderlist,
      error: false,
      success: true,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
}

// webhook
export async function webhookStripe(request, response) {
  const event = request.body;
  console.log("event type:", event.type);

  response.json({ received: true });
}
